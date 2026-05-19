package safety

import (
	"context"
	"time"
)

// StubClient is the W3 placeholder implementation. It ALWAYS returns
// VerdictPass with score=0 and empty reasons, regardless of payload.
//
// Purpose: unblock SEARCH-2 W4 (search.lurus.cn going public) by
// proving the wire — middleware -> client -> audit log columns — is
// hooked up end-to-end. The stub is NOT a content filter; it is a
// "vendor reachable" signal. W4 swaps `CONTENT_SAFETY_VENDOR=stub`
// for `alibaba_green` once the Aliyun access keys are provisioned.
//
// Stub still measures and reports LatencyMs (effectively 0) so the
// audit log + Prometheus histogram pipeline can be exercised before
// a real vendor is wired in.
type StubClient struct{}

// NewStubClient returns a ready-to-use stub. Construction is free
// of side effects so the constructor cannot fail.
func NewStubClient() *StubClient {
	return &StubClient{}
}

// CheckInput always passes. ctx is honoured purely for symmetry —
// the stub does no network I/O, so cancellation is a no-op in
// practice.
func (s *StubClient) CheckInput(ctx context.Context, req CheckReq) (CheckResp, error) {
	return s.passResp(ctx), nil
}

// CheckOutput always passes. Same contract as CheckInput.
func (s *StubClient) CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error) {
	return s.passResp(ctx), nil
}

// Vendor returns the stable label "stub" used in audit logs +
// Prometheus labels. Tests assert on this string.
func (s *StubClient) Vendor() string {
	return VendorStub
}

func (s *StubClient) passResp(ctx context.Context) CheckResp {
	start := time.Now()
	// Honour ctx cancellation so callers exercising deadline paths
	// in tests don't think the stub is ignoring them.
	if err := ctx.Err(); err != nil {
		return CheckResp{
			Verdict:   VerdictPass,
			Score:     0,
			Reasons:   []string{},
			VendorID:  VendorStub,
			LatencyMs: time.Since(start).Milliseconds(),
		}
	}
	return CheckResp{
		Verdict:   VerdictPass,
		Score:     0,
		Reasons:   []string{},
		VendorID:  VendorStub,
		LatencyMs: time.Since(start).Milliseconds(),
	}
}
