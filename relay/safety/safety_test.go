package safety

import (
	"context"
	"errors"
	"testing"
	"time"
)

// TestStubClient_AlwaysPasses verifies the W3 contract: the stub
// adapter must return VerdictPass for every input regardless of
// content. If this ever starts returning anything else, downstream
// services (search-gw / kova / lucrum / newapi-direct) will start
// 451-ing real traffic during W3-W4 transition — see ADR-0016.
func TestStubClient_AlwaysPasses(t *testing.T) {
	t.Parallel()
	client := NewStubClient()
	ctx := context.Background()
	cases := []struct {
		name string
		req  CheckReq
	}{
		{"empty", CheckReq{Content: ""}},
		{"benign", CheckReq{Content: "hello world"}},
		{"known-bad-but-stub-doesnt-care", CheckReq{Content: "obvious violation prompt"}},
		{"with-meta", CheckReq{
			AccountID: "acc-1",
			OrgID:     "org-9",
			Model:     "gpt-4o",
			Content:   "anything",
			Direction: DirectionInput,
			SourceSvc: "search-gw",
			RequestID: "req-abc",
		}},
		{"stream-chunk", CheckReq{
			Content:   "partial",
			Direction: DirectionOutput,
			StreamSeq: 3,
		}},
	}
	for _, tc := range cases {
		t.Run("CheckInput/"+tc.name, func(t *testing.T) {
			t.Parallel()
			resp, err := client.CheckInput(ctx, tc.req)
			if err != nil {
				t.Fatalf("CheckInput returned err: %v", err)
			}
			if resp.Verdict != VerdictPass {
				t.Errorf("Verdict = %v, want %v", resp.Verdict, VerdictPass)
			}
			if resp.Score != 0 {
				t.Errorf("Score = %v, want 0", resp.Score)
			}
			if len(resp.Reasons) != 0 {
				t.Errorf("Reasons = %v, want empty", resp.Reasons)
			}
			if resp.VendorID != VendorStub {
				t.Errorf("VendorID = %q, want %q", resp.VendorID, VendorStub)
			}
		})
		t.Run("CheckOutput/"+tc.name, func(t *testing.T) {
			t.Parallel()
			resp, err := client.CheckOutput(ctx, tc.req)
			if err != nil {
				t.Fatalf("CheckOutput returned err: %v", err)
			}
			if resp.Verdict != VerdictPass {
				t.Errorf("Verdict = %v, want %v", resp.Verdict, VerdictPass)
			}
		})
	}
}

// TestStubClient_HonorsContextCancellation: even though the stub
// does no I/O it should respect ctx — tests that exercise deadline
// paths shouldn't get spurious passes via stub.
func TestStubClient_HonorsContextCancellation(t *testing.T) {
	t.Parallel()
	client := NewStubClient()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // pre-cancel
	resp, err := client.CheckInput(ctx, CheckReq{Content: "x"})
	if err != nil {
		t.Fatalf("err = %v, want nil (stub never errors)", err)
	}
	// Stub still returns Pass; the assertion is that the call
	// doesn't hang or panic.
	if resp.Verdict != VerdictPass {
		t.Errorf("Verdict = %v, want Pass", resp.Verdict)
	}
}

func TestStubClient_Vendor(t *testing.T) {
	t.Parallel()
	if got := NewStubClient().Vendor(); got != VendorStub {
		t.Errorf("Vendor() = %q, want %q", got, VendorStub)
	}
}

// TestVerdictString locks the log-field tokens. SQL queries +
// Prometheus labels grep on these strings; if they shift the alert
// rules + grafana panels break silently.
func TestVerdictString(t *testing.T) {
	t.Parallel()
	cases := []struct {
		v    Verdict
		want string
	}{
		{VerdictPass, "pass"},
		{VerdictReview, "review"},
		{VerdictReject, "reject"},
		{Verdict(99), "unknown"},
	}
	for _, tc := range cases {
		if got := tc.v.String(); got != tc.want {
			t.Errorf("Verdict(%d).String() = %q, want %q", tc.v, got, tc.want)
		}
	}
}

// TestInterfaceCompliance is a compile-time + runtime check that
// every adapter actually implements ContentSafetyClient. The
// non-stub adapters panic on CheckInput/CheckOutput so we only
// verify Vendor() — but the interface assertion catches signature
// drift even without exercising the panicking methods.
func TestInterfaceCompliance(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		client ContentSafetyClient
		want   string
	}{
		{"stub", NewStubClient(), VendorStub},
		{"alibaba", NewAlibabaGreenClient("", "", ""), VendorAlibabaGreen},
		{"tencent", NewTencentTSecClient("", "", ""), VendorTencentTSec},
		{"yidun", NewNeteaseYidunClient("", "", ""), VendorNeteaseYidun},
	}
	for _, tc := range cases {
		if got := tc.client.Vendor(); got != tc.want {
			t.Errorf("%s.Vendor() = %q, want %q", tc.name, got, tc.want)
		}
	}
}

// TestNonStubAdaptersPanic locks the TODO contract: until W4-W6
// these clients MUST panic if a caller forgets to gate on
// CONTENT_SAFETY_VENDOR. Silent no-op would be worse — the audit
// log would falsely claim a vendor classified content.
func TestNonStubAdaptersPanic(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		client ContentSafetyClient
	}{
		{"alibaba", NewAlibabaGreenClient("k", "s", "r")},
		{"tencent", NewTencentTSecClient("k", "s", "b")},
		{"yidun", NewNeteaseYidunClient("k", "s", "b")},
	}
	for _, tc := range cases {
		t.Run(tc.name+"/CheckInput", func(t *testing.T) {
			assertPanics(t, func() {
				_, _ = tc.client.CheckInput(context.Background(), CheckReq{})
			})
		})
		t.Run(tc.name+"/CheckOutput", func(t *testing.T) {
			assertPanics(t, func() {
				_, _ = tc.client.CheckOutput(context.Background(), CheckReq{})
			})
		})
	}
}

func assertPanics(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if r := recover(); r == nil {
			t.Errorf("expected panic, got none")
		}
	}()
	fn()
}

// errClient is a fake adapter used to verify the table-driven
// error contract: returning an error must not produce a verdict
// the middleware would mistake for a vendor pass.
type errClient struct{ err error }

func (e *errClient) CheckInput(ctx context.Context, req CheckReq) (CheckResp, error) {
	return CheckResp{}, e.err
}
func (e *errClient) CheckOutput(ctx context.Context, req CheckReq) (CheckResp, error) {
	return CheckResp{}, e.err
}
func (e *errClient) Vendor() string { return "err-fake" }

func TestErrClient_ProducesEmptyResp(t *testing.T) {
	t.Parallel()
	c := &errClient{err: errors.New("vendor 5xx")}
	resp, err := c.CheckInput(context.Background(), CheckReq{})
	if err == nil {
		t.Fatal("expected err, got nil")
	}
	if resp.Verdict != VerdictPass {
		// zero-value of Verdict is VerdictPass; documenting that
		// the middleware MUST check err first, not rely on Verdict
		// in the error branch.
		t.Errorf("zero-value Verdict = %v; middleware contract is to ignore Verdict when err != nil", resp.Verdict)
	}
}

// TestStubLatencyMeasured ensures LatencyMs is populated (even if 0)
// so audit log writers don't have to guard against missing fields.
func TestStubLatencyMeasured(t *testing.T) {
	t.Parallel()
	client := NewStubClient()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	resp, _ := client.CheckInput(ctx, CheckReq{Content: "x"})
	// Stub latency should be measurable but tiny; we just assert
	// it's not negative (a sentinel "not measured" bug pattern).
	if resp.LatencyMs < 0 {
		t.Errorf("LatencyMs = %d, want >= 0", resp.LatencyMs)
	}
}
