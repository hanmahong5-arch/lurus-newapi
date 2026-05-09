package gemini

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// IsGeminiNativeImageModel reports whether a model name designates Gemini's
// native multimodal image-generation models (Nano Banana / gemini-*-image-*).
// These models are served through the standard generateContent endpoint with
// responseModalities: ["IMAGE"], not the imagen :predict endpoint.
func IsGeminiNativeImageModel(model string) bool {
	if strings.HasPrefix(model, "imagen") {
		return false
	}
	if strings.HasPrefix(model, "nano-banana") {
		return true
	}
	if strings.HasPrefix(model, "gemini-") && strings.Contains(model, "-image") {
		return true
	}
	return false
}

// ConvertNativeImageRequest builds a Gemini generateContent payload that asks
// the model to return an image (responseModalities: ["IMAGE"]). It accepts the
// OpenAI-style ImageRequest used by /v1/images/generations.
func ConvertNativeImageRequest(request dto.ImageRequest) (any, error) {
	prompt := strings.TrimSpace(request.Prompt)
	if prompt == "" {
		return nil, errors.New("prompt is required")
	}

	parts := []dto.GeminiPart{{Text: prompt}}

	geminiRequest := dto.GeminiChatRequest{
		Contents: []dto.GeminiChatContent{{
			Role:  "user",
			Parts: parts,
		}},
		GenerationConfig: dto.GeminiChatGenerationConfig{
			// Gemini multimodal image-gen models require BOTH modalities;
			// IMAGE alone is rejected and the model falls back to text only.
			ResponseModalities: []string{"TEXT", "IMAGE"},
		},
	}

	return geminiRequest, nil
}

// GeminiNativeImageHandler parses a generateContent response that carries
// inline image data and rewrites it into the OpenAI image-response shape so
// callers of /v1/images/generations get a uniform contract.
func GeminiNativeImageHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, types.NewOpenAIError(readErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	var geminiResp dto.GeminiChatResponse
	if jsonErr := common.Unmarshal(body, &geminiResp); jsonErr != nil {
		return nil, types.NewOpenAIError(jsonErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	openAIResp := dto.ImageResponse{
		Created: common.GetTimestamp(),
		Data:    make([]dto.ImageData, 0),
	}

	var textFallback strings.Builder

	for _, candidate := range geminiResp.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData != nil && part.InlineData.Data != "" &&
				strings.HasPrefix(part.InlineData.MimeType, "image/") {
				openAIResp.Data = append(openAIResp.Data, dto.ImageData{
					B64Json: part.InlineData.Data,
				})
				continue
			}
			if part.Text != "" {
				if textFallback.Len() > 0 {
					textFallback.WriteString(" ")
				}
				textFallback.WriteString(part.Text)
			}
		}
	}

	if len(openAIResp.Data) == 0 {
		// Surface model's textual refusal/explanation so callers can act on it.
		msg := "no images generated"
		if t := strings.TrimSpace(textFallback.String()); t != "" {
			msg = "no images generated: " + t
		}
		return nil, types.NewOpenAIError(errors.New(msg), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	respBytes, marshalErr := common.Marshal(openAIResp)
	if marshalErr != nil {
		return nil, types.NewOpenAIError(marshalErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	c.Header("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	if _, writeErr := c.Writer.Write(respBytes); writeErr != nil {
		return nil, types.NewOpenAIError(writeErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	usage := &dto.Usage{
		PromptTokens:     geminiResp.UsageMetadata.PromptTokenCount,
		CompletionTokens: geminiResp.UsageMetadata.CandidatesTokenCount,
		TotalTokens:      geminiResp.UsageMetadata.TotalTokenCount,
	}
	return usage, nil
}
