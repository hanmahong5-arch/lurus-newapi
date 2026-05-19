package safety

import "context"

// NeteaseYidunClient is the W6+ alt vendor (网易易盾 Text Moderation).
// Selected as alt per Mary research; uniquely supports the
// VerdictReview path (human moderation queue) — the other two
// vendors only return pass / reject.
//
// TODO(W6 / 6/16+ / Amelia): wire the real impl
//   - Endpoint:    https://as.dun.163.com/v5/text/check (sync) +
//                  /v5/text/callback for the async review path.
//   - Auth:        Yidun SecretId/SecretKey signing
//                  (CONTENT_SAFETY_YIDUN_SECRET_ID +
//                  CONTENT_SAFETY_YIDUN_SECRET_KEY +
//                  CONTENT_SAFETY_YIDUN_BUSINESS_ID).
//   - Review:      Yidun returns suggestion=1 ("review") for
//                  borderline content; this maps to VerdictReview
//                  and writes safety_verdict_in=1 in the log table
//                  so the W6+ review queue consumer can pick it up.
//   - Label map:   Yidun "subLabel" -> Lurus normalized labels in
//                  relay/safety/normalize.go.
type NeteaseYidunClient struct {
	secretID   string
	secretKey  string
	businessID string
}

// NewNeteaseYidunClient is the constructor used by the factory.
func NewNeteaseYidunClient(secretID, secretKey, businessID string) *NeteaseYidunClient {
	return &NeteaseYidunClient{
		secretID:   secretID,
		secretKey:  secretKey,
		businessID: businessID,
	}
}

// CheckInput is not yet implemented — see TODO above.
func (y *NeteaseYidunClient) CheckInput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.NeteaseYidunClient.CheckInput: not implemented yet (W6 task)")
}

// CheckOutput is not yet implemented — see TODO above.
func (y *NeteaseYidunClient) CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.NeteaseYidunClient.CheckOutput: not implemented yet (W6 task)")
}

// Vendor returns the stable VendorID.
func (y *NeteaseYidunClient) Vendor() string {
	return VendorNeteaseYidun
}
