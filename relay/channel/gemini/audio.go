package gemini

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// geminiTTSRequest is the Gemini generateContent request with audio output modality.
type geminiTTSRequest struct {
	Contents         []geminiTTSContent `json:"contents"`
	GenerationConfig geminiTTSGenConfig `json:"generationConfig"`
}

type geminiTTSContent struct {
	Parts []geminiTTSPart `json:"parts"`
}

type geminiTTSPart struct {
	Text string `json:"text,omitempty"`
}

type geminiTTSGenConfig struct {
	ResponseModalities []string         `json:"responseModalities"`
	SpeechConfig       *geminiSpeechCfg `json:"speechConfig,omitempty"`
}

type geminiSpeechCfg struct {
	VoiceConfig geminiVoiceConfig `json:"voiceConfig"`
}

type geminiVoiceConfig struct {
	PrebuiltVoiceConfig geminiPrebuiltVoice `json:"prebuiltVoiceConfig"`
}

type geminiPrebuiltVoice struct {
	VoiceName string `json:"voiceName"`
}

type geminiTTSResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				InlineData *struct {
					MimeType string `json:"mimeType"`
					Data     string `json:"data"`
				} `json:"inlineData,omitempty"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

func mapVoiceToGemini(voice string) string {
	switch voice {
	case "alloy":
		return "Kore"
	case "echo":
		return "Charon"
	case "fable":
		return "Fenrir"
	case "onyx":
		return "Orus"
	case "nova":
		return "Aoede"
	case "shimmer":
		return "Zephyr"
	default:
		return voice
	}
}

// ConvertAudioRequestToGemini converts an OpenAI TTS request to Gemini generateContent format.
func ConvertAudioRequestToGemini(request dto.AudioRequest) (io.Reader, error) {
	voice := mapVoiceToGemini(request.Voice)

	text := request.Input
	if isMostlyCJK(text) {
		text = "Hello. " + text
	}

	geminiReq := geminiTTSRequest{
		Contents: []geminiTTSContent{
			{Parts: []geminiTTSPart{{Text: text}}},
		},
		GenerationConfig: geminiTTSGenConfig{
			ResponseModalities: []string{"AUDIO"},
			SpeechConfig: &geminiSpeechCfg{
				VoiceConfig: geminiVoiceConfig{
					PrebuiltVoiceConfig: geminiPrebuiltVoice{
						VoiceName: voice,
					},
				},
			},
		},
	}

	body, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini TTS request: %w", err)
	}
	return bytes.NewReader(body), nil
}

// GeminiTTSHandler processes the Gemini TTS response and writes raw audio to the client.
func GeminiTTSHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (any, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, types.NewOpenAIError(
			fmt.Errorf("gemini TTS upstream error (HTTP %d): %s", resp.StatusCode, truncateTTSStr(string(respBody), 300)),
			types.ErrorCodeBadResponseStatusCode,
			resp.StatusCode,
		)
	}

	var geminiResp geminiTTSResponse
	if err := common.Unmarshal(respBody, &geminiResp); err != nil {
		return nil, types.NewOpenAIError(
			fmt.Errorf("parse gemini TTS response: %w", err),
			types.ErrorCodeBadResponseBody,
			http.StatusInternalServerError,
		)
	}

	if geminiResp.Error != nil {
		return nil, types.NewOpenAIError(
			fmt.Errorf("gemini TTS error: %s", geminiResp.Error.Message),
			types.ErrorCodeBadResponse,
			geminiResp.Error.Code,
		)
	}

	var audioData []byte
	for _, candidate := range geminiResp.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData != nil && part.InlineData.Data != "" {
				decoded, err := base64.StdEncoding.DecodeString(part.InlineData.Data)
				if err != nil {
					continue
				}
				audioData = decoded
				break
			}
		}
		if audioData != nil {
			break
		}
	}

	if audioData == nil {
		return nil, types.NewOpenAIError(
			fmt.Errorf("gemini TTS returned no audio data"),
			types.ErrorCodeBadResponse,
			http.StatusBadGateway,
		)
	}

	c.Writer.Header().Set("Content-Type", "audio/wav")
	c.Writer.Header().Set("Content-Length", fmt.Sprintf("%d", len(audioData)))
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(audioData)

	usage := &dto.Usage{}
	usage.PromptTokens = info.GetEstimatePromptTokens()
	usage.CompletionTokens = len(audioData) / 1000
	usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	return usage, nil
}

func isMostlyCJK(text string) bool {
	var cjk, total int
	for _, r := range text {
		if r <= ' ' {
			continue
		}
		total++
		if r >= 0x4E00 && r <= 0x9FFF || r >= 0x3400 && r <= 0x4DBF ||
			r >= 0x3000 && r <= 0x303F || r >= 0xFF00 && r <= 0xFFEF ||
			r >= 0x3040 && r <= 0x309F || r >= 0x30A0 && r <= 0x30FF {
			cjk++
		}
	}
	return total > 0 && cjk*100/total > 60
}

func truncateTTSStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
