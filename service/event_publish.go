// Package service: typed event helpers for downstream notification consumers.
//
// These helpers wrap the global EventPublisher with the exact envelope shapes
// expected by 2l-svc-platform/modules/notification/internal/pkg/event/types.go.
// Subjects + envelopes MUST match the consumer; the consumer is canonical and
// has dedup-by-event_id, so we generate UUIDs for every emission.
package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/google/uuid"
)

// Stream subjects (mirrored from 2l-svc-platform notification consumer).
// Kept as constants here rather than imported so newapi has no module
// dependency on the platform repo.
const (
	subjectLLMImageGenerated = "llm.image.generated"
	subjectLLMUsageMilestone = "llm.usage.milestone"
)

// llmEventEnvelope mirrors event.LLMEvent in the platform notification module.
//
// Wire format:
//
//	{
//	  "event_id":  "<uuid>",
//	  "event_type": "<subject>",
//	  "account_id": <int64>,
//	  "payload":    {...},                 // typed payload, see below
//	  "occurred_at": "2026-04-30T10:00:00Z"
//	}
type llmEventEnvelope struct {
	EventID    string          `json:"event_id"`
	EventType  string          `json:"event_type"`
	AccountID  int64           `json:"account_id"`
	Payload    json.RawMessage `json:"payload"`
	OccurredAt time.Time       `json:"occurred_at"`
}

// llmImageGeneratedPayload mirrors event.LLMImageGeneratedPayload.
type llmImageGeneratedPayload struct {
	JobID    string `json:"job_id"`
	ImageURL string `json:"image_url"`
	Prompt   string `json:"prompt"`
}

// llmUsageMilestonePayload mirrors event.LLMUsageMilestonePayload.
type llmUsageMilestonePayload struct {
	Period     string `json:"period"`      // "day" | "month" | "lifetime"
	TokensUsed int64  `json:"tokens_used"`
	Milestone  string `json:"milestone"`   // human-readable bucket label
}

// PublishImageGenerated emits one llm.image.generated event for the user.
// userID is the platform account_id (newapi user.id == platform account_id
// by SSO bridge convention). prompt is truncatePromptForEventd to 80 chars to match the
// notification UX expectation.
func PublishImageGenerated(ctx context.Context, userID int, model, prompt, imageURL string) {
	if userID <= 0 {
		return
	}
	payload := llmImageGeneratedPayload{
		JobID:    uuid.NewString(),
		ImageURL: imageURL,
		Prompt:   truncatePromptForEvent(prompt, 80),
	}
	publishLLMEvent(ctx, subjectLLMImageGenerated, int64(userID), payload)
}

// PublishUsageMilestone emits one llm.usage.milestone event. Caller must have
// already determined that the user crossed the milestone (use CheckAndMarkMilestone).
func PublishUsageMilestone(ctx context.Context, userID int, tokensUsed int64, milestone, period string) {
	if userID <= 0 {
		return
	}
	payload := llmUsageMilestonePayload{
		Period:     period,
		TokensUsed: tokensUsed,
		Milestone:  milestone,
	}
	publishLLMEvent(ctx, subjectLLMUsageMilestone, int64(userID), payload)
}

// publishLLMEvent builds the canonical envelope and hands off to the publisher.
// Marshaling errors are logged but never propagated to the caller; this is a
// fire-and-forget side effect.
func publishLLMEvent(ctx context.Context, subject string, accountID int64, typedPayload any) {
	rawPayload, err := json.Marshal(typedPayload)
	if err != nil {
		common.SysError("publishLLMEvent: marshal payload: " + err.Error())
		return
	}
	envelope := llmEventEnvelope{
		EventID:    uuid.NewString(),
		EventType:  subject,
		AccountID:  accountID,
		Payload:    rawPayload,
		OccurredAt: time.Now().UTC(),
	}
	if err := Publisher.Publish(ctx, subject, envelope); err != nil {
		common.SysError("publishLLMEvent: enqueue " + subject + ": " + err.Error())
	}
}

// truncatePromptForEvent returns s if len(s) <= max, else s[:max] in rune-safe slicing.
// Avoids slicing inside a multi-byte UTF-8 sequence.
func truncatePromptForEvent(s string, max int) string {
	if len(s) <= max {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
