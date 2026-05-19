// Package safety defines the ContentSafetyClient interface and the data
// types exchanged between the newapi gateway middleware and AIGC content
// safety vendors (Aliyun Green / Tencent T-Sec / Netease Yidun).
//
// See ADR-0016 (2l-svc-platform/doc/decisions/0016-c11-aigc-content-safety-wrapper.md)
// for the rationale: 1 interface, 4 implementations, vendor verdict + reasons
// + score + latency normalized across vendors so the audit log and the
// downstream services (search-gw / kova / lucrum / newapi-direct) stay
// vendor-agnostic.
package safety

import "context"

// Verdict is the normalized cross-vendor classification.
//
//	VerdictPass    — let the request / response through.
//	VerdictReview  — needs human review (Yidun only today; other vendors
//	                 never return this).
//	VerdictReject  — block; middleware returns 451 to caller.
type Verdict int

const (
	VerdictPass Verdict = iota
	VerdictReview
	VerdictReject
)

// String returns a stable lowercase token suitable for log fields and
// Prometheus labels. Stable so the alert rules and SQL queries don't
// drift when we add vendors later.
func (v Verdict) String() string {
	switch v {
	case VerdictPass:
		return "pass"
	case VerdictReview:
		return "review"
	case VerdictReject:
		return "reject"
	default:
		return "unknown"
	}
}

// CheckReq carries everything a vendor needs to classify a single
// input or output payload. The same shape is used for both directions
// — the StreamSeq field is only meaningful on output checks (0 = the
// whole non-stream response; N > 0 = the N-th stream chunk).
type CheckReq struct {
	AccountID string // Lurus account id (PIPL data classification key)
	OrgID     string // RLS scoping; may be empty for personal accounts
	Model     string // LLM model name (e.g. gpt-4o)
	Content   string // prompt (input) or completion text (output)
	Direction Direction
	StreamSeq int    // output stream chunk index; 0 = non-stream
	SourceSvc string // search-gw / kova / lucrum / newapi-direct
	RequestID string // x-request-id for correlation across services
}

// Direction tells the adapter which API to call (some vendors expose
// distinct endpoints for input vs output classification).
type Direction string

const (
	DirectionInput  Direction = "input"
	DirectionOutput Direction = "output"
)

// CheckResp is the normalized vendor verdict. Adapters MUST translate
// vendor-specific tags into the stable Lurus labels in `Reasons`
// (e.g. "porn" / "politics" / "violence") so cross-vendor switching
// doesn't break downstream queries.
type CheckResp struct {
	Verdict   Verdict
	Score     float64  // 0.0-1.0 normalized confidence
	Reasons   []string // normalized labels e.g. ["porn","politics"]
	VendorID  string   // alibaba_green / tencent_tsec / netease_yidun / stub
	LatencyMs int64    // measured round-trip; written to audit log
}

// ContentSafetyClient is the wire between the gateway and any
// vendor implementation. Both methods MUST honour ctx (cancellation +
// deadline) — vendor latency lives on the LLM request hot path so a
// stuck vendor must not block the caller forever.
type ContentSafetyClient interface {
	// CheckInput classifies user prompts before they reach the LLM.
	// Returning VerdictReject short-circuits the request: the middleware
	// writes a 451 response and never calls the upstream model.
	CheckInput(ctx context.Context, req CheckReq) (CheckResp, error)

	// CheckOutput classifies LLM responses. For non-stream responses
	// the middleware calls it once with StreamSeq=0; for stream
	// responses every N chunks (N configured in middleware).
	CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error)

	// Vendor returns the stable VendorID written to the audit log
	// and used as a Prometheus label. MUST be one of the constants
	// defined alongside the concrete adapter.
	Vendor() string
}

// Stable VendorID values. Adding a new vendor = add a constant here
// + a concrete adapter file. The string values are part of the
// public log schema, do not rename without a migration.
const (
	VendorStub          = "stub"
	VendorAlibabaGreen  = "alibaba_green"
	VendorTencentTSec   = "tencent_tsec"
	VendorNeteaseYidun  = "netease_yidun"
)
