package safety

import "context"

// TencentTSecClient is the W5+ backup vendor (Tencent Cloud T-Sec
// TextModeration). Selected as backup per Mary research; parallel-
// vendor strategy lets us flip to T-Sec via env without redeploying
// when Aliyun Green hits a regional outage.
//
// TODO(W5 / 6/9-6/15 / Amelia): wire the real impl
//   - Endpoint:    tms.tencentcloudapi.com (TextModeration v3).
//   - Auth:        TC3-HMAC-SHA256 signing with SecretId/SecretKey
//                  (CONTENT_SAFETY_TENCENT_SECRET_ID +
//                  CONTENT_SAFETY_TENCENT_SECRET_KEY).
//   - BizType:     per-service biz type id (kova / lucrum / etc.)
//                  registered ahead of time in Tencent console.
//   - Label map:   T-Sec "EvilLabel" -> Lurus normalized labels in
//                  relay/safety/normalize.go.
//   - Timeout:     respect ctx; default 2s per call.
type TencentTSecClient struct {
	secretID  string
	secretKey string
	bizType   string
}

// NewTencentTSecClient is the constructor used by the factory.
func NewTencentTSecClient(secretID, secretKey, bizType string) *TencentTSecClient {
	return &TencentTSecClient{
		secretID:  secretID,
		secretKey: secretKey,
		bizType:   bizType,
	}
}

// CheckInput is not yet implemented — see TODO above.
func (t *TencentTSecClient) CheckInput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.TencentTSecClient.CheckInput: not implemented yet (W5 task)")
}

// CheckOutput is not yet implemented — see TODO above.
func (t *TencentTSecClient) CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error) {
	panic("safety.TencentTSecClient.CheckOutput: not implemented yet (W5 task)")
}

// Vendor returns the stable VendorID.
func (t *TencentTSecClient) Vendor() string {
	return VendorTencentTSec
}
