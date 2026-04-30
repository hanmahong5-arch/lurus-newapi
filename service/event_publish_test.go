package service

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
)

// fakePublisher is a test-only EventPublisher that captures every Publish
// call so assertions can inspect subject + payload shape.
type fakePublisher struct {
	mu    sync.Mutex
	calls []fakeCall
	err   error // when non-nil, every Publish returns this error
}

type fakeCall struct {
	Subject string
	Payload any
}

func (f *fakePublisher) Publish(_ context.Context, subject string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, fakeCall{Subject: subject, Payload: payload})
	return nil
}

func (f *fakePublisher) snapshot() []fakeCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeCall, len(f.calls))
	copy(out, f.calls)
	return out
}

// withFakePublisher swaps the global Publisher for the duration of t.
func withFakePublisher(t *testing.T) *fakePublisher {
	t.Helper()
	prev := Publisher
	fp := &fakePublisher{}
	Publisher = fp
	t.Cleanup(func() { Publisher = prev })
	return fp
}

func TestPublishImageGenerated_EnvelopeShapeMatchesConsumer(t *testing.T) {
	fp := withFakePublisher(t)

	PublishImageGenerated(context.Background(), 42, "dall-e-3", "a serene mountain at sunset", "https://cdn.example/img.png")

	calls := fp.snapshot()
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}
	if calls[0].Subject != "llm.image.generated" {
		t.Fatalf("subject mismatch: got %q", calls[0].Subject)
	}

	// Round-trip JSON to verify the envelope shape the consumer expects:
	// event_id, event_type, account_id, payload{job_id,image_url,prompt}, occurred_at.
	raw, err := json.Marshal(calls[0].Payload)
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	var env map[string]any
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	for _, k := range []string{"event_id", "event_type", "account_id", "payload", "occurred_at"} {
		if _, ok := env[k]; !ok {
			t.Errorf("envelope missing key %q. full=%s", k, string(raw))
		}
	}
	if got, _ := env["event_type"].(string); got != "llm.image.generated" {
		t.Errorf("event_type=%v, want llm.image.generated", env["event_type"])
	}
	if got, _ := env["account_id"].(float64); int64(got) != 42 {
		t.Errorf("account_id=%v, want 42", env["account_id"])
	}
	payloadRaw, _ := json.Marshal(env["payload"])
	var payload map[string]any
	_ = json.Unmarshal(payloadRaw, &payload)
	for _, k := range []string{"job_id", "image_url", "prompt"} {
		if _, ok := payload[k]; !ok {
			t.Errorf("payload missing key %q. full=%s", k, string(payloadRaw))
		}
	}
	if payload["prompt"] != "a serene mountain at sunset" {
		t.Errorf("prompt=%v", payload["prompt"])
	}
	if payload["image_url"] != "https://cdn.example/img.png" {
		t.Errorf("image_url=%v", payload["image_url"])
	}
}

func TestPublishImageGenerated_TruncatesLongPromptTo80Chars(t *testing.T) {
	fp := withFakePublisher(t)

	long := ""
	for i := 0; i < 200; i++ {
		long += "a"
	}
	PublishImageGenerated(context.Background(), 1, "m", long, "")

	calls := fp.snapshot()
	if len(calls) != 1 {
		t.Fatalf("want 1 call, got %d", len(calls))
	}
	raw, _ := json.Marshal(calls[0].Payload)
	var env struct {
		Payload struct {
			Prompt string `json:"prompt"`
		} `json:"payload"`
	}
	_ = json.Unmarshal(raw, &env)
	if len(env.Payload.Prompt) != 80 {
		t.Errorf("prompt len=%d, want 80", len(env.Payload.Prompt))
	}
}

func TestPublishImageGenerated_SkipsZeroAccountID(t *testing.T) {
	fp := withFakePublisher(t)
	PublishImageGenerated(context.Background(), 0, "m", "p", "")
	PublishImageGenerated(context.Background(), -1, "m", "p", "")
	if calls := fp.snapshot(); len(calls) != 0 {
		t.Fatalf("expected no publishes for non-positive userID, got %d", len(calls))
	}
}

func TestPublishUsageMilestone_EnvelopeAndPayload(t *testing.T) {
	fp := withFakePublisher(t)

	PublishUsageMilestone(context.Background(), 7, 10000, "first_10k", "lifetime")

	calls := fp.snapshot()
	if len(calls) != 1 {
		t.Fatalf("want 1, got %d", len(calls))
	}
	if calls[0].Subject != "llm.usage.milestone" {
		t.Errorf("subject=%q", calls[0].Subject)
	}
	raw, _ := json.Marshal(calls[0].Payload)
	var env struct {
		EventID   string `json:"event_id"`
		EventType string `json:"event_type"`
		AccountID int64  `json:"account_id"`
		Payload   struct {
			Period     string `json:"period"`
			TokensUsed int64  `json:"tokens_used"`
			Milestone  string `json:"milestone"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.EventID == "" {
		t.Error("event_id empty")
	}
	if env.EventType != "llm.usage.milestone" {
		t.Errorf("event_type=%q", env.EventType)
	}
	if env.AccountID != 7 {
		t.Errorf("account_id=%d", env.AccountID)
	}
	if env.Payload.Period != "lifetime" || env.Payload.TokensUsed != 10000 || env.Payload.Milestone != "first_10k" {
		t.Errorf("payload=%+v", env.Payload)
	}
}

func TestPublishLLMEvent_GeneratesUniqueEventIDs(t *testing.T) {
	// event_id uniqueness powers the consumer dedup. Two back-to-back publishes
	// of the same logical event must still get distinct UUIDs.
	fp := withFakePublisher(t)

	PublishImageGenerated(context.Background(), 1, "m", "p", "")
	PublishImageGenerated(context.Background(), 1, "m", "p", "")

	calls := fp.snapshot()
	if len(calls) != 2 {
		t.Fatalf("want 2, got %d", len(calls))
	}
	r0, _ := json.Marshal(calls[0].Payload)
	r1, _ := json.Marshal(calls[1].Payload)
	var e0, e1 struct{ EventID string `json:"event_id"` }
	_ = json.Unmarshal(r0, &e0)
	_ = json.Unmarshal(r1, &e1)
	if e0.EventID == "" || e1.EventID == "" {
		t.Fatal("event_id must be non-empty")
	}
	if e0.EventID == e1.EventID {
		t.Errorf("event_ids must differ: %s == %s", e0.EventID, e1.EventID)
	}
}

func TestPublishLLMEvent_SwallowsPublisherErrors(t *testing.T) {
	// Publisher failure must NOT panic / block the caller. Failed-to-enqueue
	// is logged and dropped.
	prev := Publisher
	Publisher = &fakePublisher{err: errors.New("queue full")}
	t.Cleanup(func() { Publisher = prev })

	// If this panics or blocks the test will hang/fail; success = quiet return.
	PublishImageGenerated(context.Background(), 99, "m", "p", "u")
	PublishUsageMilestone(context.Background(), 99, 100, "first_1k", "lifetime")
}

func TestNoopPublisher_AlwaysSucceeds(t *testing.T) {
	n := NoopEventPublisher{}
	if err := n.Publish(context.Background(), "any", map[string]int{"x": 1}); err != nil {
		t.Errorf("noop should never error, got %v", err)
	}
}

func TestTruncatePromptForEvent_RuneSafe(t *testing.T) {
	// Input is multi-byte UTF-8 ("一" = 3 bytes). truncatePromptForEvent must
	// not slice inside a rune.
	in := "一二三四五六七八九十"
	out := truncatePromptForEvent(in, 3)
	if got := []rune(out); len(got) != 3 {
		t.Errorf("rune count=%d, want 3", len(got))
	}
}
