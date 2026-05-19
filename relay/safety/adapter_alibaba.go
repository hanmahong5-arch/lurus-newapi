package safety

import "context"

// AlibabaGreenClient is the W4 real implementation backed by Aliyun
// Content Moderation (Green) text/scan sync API. Selected as the
// default vendor per Mary research (CN compliance + Lurus already
// uses Dysms under the same Aliyun account so RAM credentials can
// be reused).
//
// TODO(W4 / 6/2-6/8 / Amelia): wire the real impl
//   - Endpoint:    https://green.<region>.aliyuncs.com (region pinned
//                  to CONTENT_SAFETY_ALIBABA_REGION, same as Dysms).
//   - Auth:        AK/SK pair from env (CONTENT_SAFETY_ALIBABA_ACCESS_KEY_ID
//                  + CONTENT_SAFETY_ALIBABA_ACCESS_KEY_SECRET).
//   - Scenes:      "antispam" / "porn" / "political" / "ad" / "abuse".
//   - Tag map:     translate the Aliyun label set into the normalized
//                  Lurus labels in relay/safety/normalize.go (added W4).
//   - Timeout:     respect ctx deadline; do NOT block past it.
//   - Fail-mode:   middleware decides per-service; this client returns
//                  the error and lets the middleware open/close.
type AlibabaGreenClient struct {
	accessKeyID     string
	accessKeySecret string
	region          string
}

// NewAlibabaGreenClient is the constructor used by the factory once
// CONTENT_SAFETY_VENDOR=alibaba_green is set in env. W3 keeps it as
// a no-op shell so the factory compiles; W4 fills the body.
func NewAlibabaGreenClient(accessKeyID, accessKeySecret, region string) *AlibabaGreenClient {
	return &AlibabaGreenClient{
		accessKeyID:     accessKeyID,
		accessKeySecret: accessKeySecret,
		region:          region,
	}
}

// CheckInput is not yet implemented — see TODO above.
func (a *AlibabaGreenClient) CheckInput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.AlibabaGreenClient.CheckInput: not implemented yet (W4 task)")
}

// CheckOutput is not yet implemented — see TODO above.
func (a *AlibabaGreenClient) CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.AlibabaGreenClient.CheckOutput: not implemented yet (W4 task)")
}

// Vendor returns the stable VendorID. Safe to call even though
// the check methods panic — factory uses it for label registration.
func (a *AlibabaGreenClient) Vendor() string {
	return VendorAlibabaGreen
}
