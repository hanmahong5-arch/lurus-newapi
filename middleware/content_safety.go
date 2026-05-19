package middleware

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/safety"

	"github.com/gin-gonic/gin"
)

// Env var names. See ADR-0016 §3.
const (
	envSafetyEnabled  = "CONTENT_SAFETY_ENABLED"  // true / false; default false
	envSafetyVendor   = "CONTENT_SAFETY_VENDOR"   // stub / alibaba_green / tencent_tsec / netease_yidun
	envSafetyFailMode = "CONTENT_SAFETY_FAIL_MODE" // open / closed / review-required; per-service override below
)

// Per-service fail-mode default. ADR-0016 §Fail-mode-per-service.
//
//	search-gw       — open  (false-positive on short search query is
//	                  worse than a missed reject on benign content;
//	                  W5+ backup vendor parallel catches the gap).
//	kova            — open  (agent long sessions; vendor blip must
//	                  not break the conversation).
//	newapi-direct   — open  (backend direct, audit log is the
//	                  long-tail catch).
//	lucrum          — CLOSED (financial advice; legal risk is high
//	                  enough that "no answer" beats "wrong answer").
var defaultFailModeBySvc = map[string]FailMode{
	"search-gw":     FailOpen,
	"kova":          FailOpen,
	"newapi-direct": FailOpen,
	"lucrum":        FailClosed,
}

// FailMode controls what happens when the vendor errors out (5xx,
// timeout, network). open = let the request through; closed = reject
// with 503 and refuse to call the LLM.
type FailMode int

const (
	FailOpen   FailMode = iota // permit on vendor error
	FailClosed                  // reject on vendor error
)

// safetyContextKey stores the per-request decision so the response
// post-check branch can find the same client + svc tag without
// rereading env.
type safetyContextKey struct{}

type safetyContext struct {
	client    safety.ContentSafetyClient
	sourceSvc string
	failMode  FailMode
	accountID string
	orgID     string
	model     string
	requestID string
}

// ContentSafety returns the gin middleware that wraps a LLM relay
// route. Order on the route MUST be:
//
//	authMW  -> rateLimitMW  -> ContentSafety  -> relayHandler
//
// because ContentSafety reads the authenticated account id from
// the gin context. It runs in three phases:
//
//	1) pre-request:   read body, call CheckInput, short-circuit on reject.
//	2) c.Next():      let the relay handler run.
//	3) post-response: call CheckOutput on the captured body
//	                  (stream or non-stream). On output reject the
//	                  response has already been flushed for stream;
//	                  we record the verdict in the log but cannot
//	                  un-send bytes. See "Stream caveat" below.
//
// Stream caveat: the W3 stub never rejects, so the only consumer of
// the post-stream verdict in W3 is the audit log. W5 swaps to a real
// vendor and the middleware will be extended with stream chunk
// interception (see ADR-0016 §4 + PRD R5).
func ContentSafety(client safety.ContentSafetyClient) gin.HandlerFunc {
	if !isSafetyEnabled() {
		// No-op handler so route registration stays valid.
		return func(c *gin.Context) { c.Next() }
	}
	if client == nil {
		// Fail-closed at boot rather than silently disabling
		// (CLAUDE.md §2 启动期 fast-fail).
		panic("middleware.ContentSafety: enabled but client is nil")
	}
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		sourceSvc := sourceSvcFromRequest(c)
		failMode := failModeFor(sourceSvc)

		// Read + restore body so the downstream handler still sees it.
		body, err := readAndRestoreBody(c.Request)
		if err != nil {
			common.SysLog("content_safety: read body failed: " + err.Error())
			if failMode == FailClosed {
				abortJSON(c, http.StatusServiceUnavailable, "content safety unavailable")
				return
			}
			c.Next()
			return
		}

		req := safety.CheckReq{
			AccountID: gctxString(c, "id"),
			OrgID:     gctxString(c, "org_id"),
			Model:     gctxString(c, "model_name"),
			Content:   string(body),
			Direction: safety.DirectionInput,
			SourceSvc: sourceSvc,
			RequestID: gctxString(c, common.RequestIdKey),
		}

		resp, err := client.CheckInput(ctx, req)
		if err != nil {
			common.SysLog("content_safety: input check error: " + err.Error())
			c.Set("safety_input_error", err.Error())
			if failMode == FailClosed {
				abortJSON(c, http.StatusServiceUnavailable, "content safety vendor unavailable")
				return
			}
			// fail-open: continue with no verdict on input.
		} else {
			c.Set("safety_input_verdict", int(resp.Verdict))
			c.Set("safety_input_score", resp.Score)
			c.Set("safety_input_reasons", resp.Reasons)
			c.Set("safety_input_latency_ms", resp.LatencyMs)
			c.Set("safety_vendor", resp.VendorID)
			if resp.Verdict == safety.VerdictReject {
				// 451 Unavailable For Legal Reasons — per ADR-0016 +
				// PRD AC2; do NOT leak vendor reasons to the client.
				abortJSON(c, http.StatusUnavailableForLegalReasons, "request rejected by content policy")
				return
			}
		}

		// Capture response body for the post-check.
		bw := &bodyCapture{ResponseWriter: c.Writer, buf: &bytes.Buffer{}}
		c.Writer = bw

		// Stash ctx for the response-side post-check.
		c.Set("safety_ctx", &safetyContext{
			client:    client,
			sourceSvc: sourceSvc,
			failMode:  failMode,
			accountID: req.AccountID,
			orgID:     req.OrgID,
			model:     req.Model,
			requestID: req.RequestID,
		})

		c.Next()

		// Post-response check. For stream responses the body is the
		// already-flushed SSE stream; for non-stream it's the JSON
		// payload. Both paths run through the same CheckOutput call
		// — the StreamSeq=0 marker means "whole body" so adapters
		// can decide whether to scan the full text or treat each
		// SSE chunk individually (W5).
		postReq := safety.CheckReq{
			AccountID: req.AccountID,
			OrgID:     req.OrgID,
			Model:     req.Model,
			Content:   bw.buf.String(),
			Direction: safety.DirectionOutput,
			StreamSeq: 0,
			SourceSvc: sourceSvc,
			RequestID: req.RequestID,
		}
		// Use a fresh ctx with a small timeout so a hanging vendor
		// can't keep the request goroutine alive past response.
		postCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		postResp, postErr := client.CheckOutput(postCtx, postReq)
		if postErr != nil {
			common.SysLog("content_safety: output check error: " + postErr.Error())
			c.Set("safety_output_error", postErr.Error())
			return
		}
		c.Set("safety_output_verdict", int(postResp.Verdict))
		c.Set("safety_output_score", postResp.Score)
		c.Set("safety_output_reasons", postResp.Reasons)
		c.Set("safety_output_latency_ms", postResp.LatencyMs)
	}
}

// isSafetyEnabled returns true iff CONTENT_SAFETY_ENABLED is exactly
// "true" (case-insensitive). Any other value -> disabled. Centralizing
// this means tests can flip it via t.Setenv.
func isSafetyEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv(envSafetyEnabled)), "true")
}

// sourceSvcFromRequest reads the X-Source-Svc header. Empty / unknown
// values default to "newapi-direct" (the safest assumption — full
// audit + open fail-mode + same as raw newapi traffic).
func sourceSvcFromRequest(c *gin.Context) string {
	v := strings.TrimSpace(c.GetHeader("X-Source-Svc"))
	switch v {
	case "search-gw", "kova", "lucrum", "newapi-direct":
		return v
	default:
		return "newapi-direct"
	}
}

// failModeFor returns the fail-mode for a service. CONTENT_SAFETY_FAIL_MODE
// env (if set) overrides per-service default — lets ops switch one
// vendor outage at a time without redeploying the manifest.
func failModeFor(svc string) FailMode {
	if v := strings.ToLower(strings.TrimSpace(os.Getenv(envSafetyFailMode))); v != "" {
		switch v {
		case "open":
			return FailOpen
		case "closed":
			return FailClosed
		}
	}
	if m, ok := defaultFailModeBySvc[svc]; ok {
		return m
	}
	return FailOpen
}

// readAndRestoreBody drains c.Request.Body and replaces it with a
// fresh reader so the downstream handler sees identical bytes. Bounded
// by the gin request size limit (already enforced upstream); we do
// NOT add a second limit here to avoid double-bounding drift.
func readAndRestoreBody(req *http.Request) ([]byte, error) {
	if req.Body == nil {
		return nil, nil
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	_ = req.Body.Close()
	req.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}

func abortJSON(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{
		"error": gin.H{
			"message": msg,
			"type":    "content_safety",
			"code":    status,
		},
	})
}

func gctxString(c *gin.Context, key string) string {
	v, ok := c.Get(key)
	if !ok || v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	default:
		return ""
	}
}

// bodyCapture is a gin.ResponseWriter that tees writes to a buffer so
// the post-response safety check can inspect the body without
// re-issuing the request. It does NOT change response semantics —
// every Write is forwarded to the underlying writer first.
type bodyCapture struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (b *bodyCapture) Write(p []byte) (int, error) {
	// Cap the buffered slice to avoid OOM on giant stream responses;
	// 256KiB is more than enough for a verdict signal but bounded.
	const cap = 256 * 1024
	if b.buf.Len() < cap {
		remaining := cap - b.buf.Len()
		if remaining >= len(p) {
			b.buf.Write(p)
		} else {
			b.buf.Write(p[:remaining])
		}
	}
	return b.ResponseWriter.Write(p)
}

func (b *bodyCapture) WriteString(s string) (int, error) {
	return b.Write([]byte(s))
}
