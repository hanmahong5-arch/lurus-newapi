// Package service: usage milestone tracker.
//
// Emits llm.usage.milestone events when a user's lifetime token total crosses
// one of a fixed ladder of thresholds (1k, 10k, 100k, 1M). Each threshold
// fires at most once per user, ever.
//
// Storage:
//   - Cumulative token total: Redis INCRBY on key "llm:tokens:<userID>".
//     This is independent of the user.used_quota DB column (which is in
//     billing units, not tokens). Loss of this counter at most causes a
//     single milestone to mis-fire — acceptable trade-off vs. adding a DB
//     column + migration.
//   - Last-fired threshold: Redis SETNX on key
//     "llm:milestone:<userID>:<threshold>". The SETNX result is the dedup
//     primitive — at most one publish per (user, threshold).
//
// If Redis is unavailable (common.RedisEnabled == false or RDB nil) this
// becomes a no-op rather than crashing the relay path.
package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Token milestone ladder. Sorted ascending. Value is the threshold (cumulative
// tokens), label is the human-readable bucket name passed to the consumer.
type milestoneTier struct {
	threshold int64
	label     string
}

var usageMilestones = []milestoneTier{
	{1_000, "first_1k"},
	{10_000, "first_10k"},
	{100_000, "first_100k"},
	{1_000_000, "first_1m"},
}

// milestoneRedisTTL controls how long the dedup keys live. We keep them for
// one year — covers any reasonable retention while still bounding memory.
const milestoneRedisTTL = 365 * 24 * time.Hour

// CheckAndPublishUsageMilestone updates the user's cumulative token counter
// and publishes one event per newly crossed milestone (typically zero or one
// per call). Safe to call from hot paths: returns immediately if Redis is
// unavailable.
//
// totalTokens is the token count for *this* request (prompt + completion);
// the function adds it to the cumulative counter atomically via INCRBY.
func CheckAndPublishUsageMilestone(ctx context.Context, userID int, totalTokens int) {
	if userID <= 0 || totalTokens <= 0 {
		return
	}
	if !common.RedisEnabled || common.RDB == nil {
		return
	}

	// Atomic increment. The new value is the post-increment cumulative total.
	cumKey := fmt.Sprintf("llm:tokens:%d", userID)
	newTotal, err := common.RDB.IncrBy(ctx, cumKey, int64(totalTokens)).Result()
	if err != nil {
		// Redis transient failure. Log + skip; we'll catch up on the next call.
		common.SysError("milestone: incr cumulative failed: " + err.Error())
		return
	}
	prevTotal := newTotal - int64(totalTokens)

	// Walk the ladder; for each tier crossed by this request, try to claim it.
	// Iterate in ascending order so labels are emitted in the natural order
	// when a single request crosses multiple tiers (rare but possible — e.g.
	// first request on a fresh account that happens to be 200k tokens).
	for _, m := range usageMilestones {
		if prevTotal >= m.threshold {
			continue // already past this tier before this request
		}
		if newTotal < m.threshold {
			break // sorted ascending; everything after is also above newTotal
		}
		if claimMilestone(ctx, userID, m.threshold) {
			PublishUsageMilestone(ctx, userID, newTotal, m.label, "lifetime")
		}
	}
}

// claimMilestone returns true if this caller is the first to reach the given
// threshold for the user. Implemented as Redis SETNX with TTL; race-safe across
// multiple newapi instances.
func claimMilestone(ctx context.Context, userID int, threshold int64) bool {
	key := fmt.Sprintf("llm:milestone:%d:%d", userID, threshold)
	ok, err := common.RDB.SetNX(ctx, key, "1", milestoneRedisTTL).Result()
	if err != nil {
		common.SysError("milestone: setnx failed: " + err.Error())
		return false
	}
	return ok
}

// MilestoneThresholds exposes the configured ladder for tests.
func MilestoneThresholds() []int64 {
	out := make([]int64, len(usageMilestones))
	for i, m := range usageMilestones {
		out[i] = m.threshold
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// crossedMilestones returns the labels of every threshold whose value is in
// (prev, new]. Pure function — exposed for tests that don't want to spin up
// Redis.
func crossedMilestones(prev, newTotal int64) []string {
	var out []string
	for _, m := range usageMilestones {
		if prev >= m.threshold {
			continue
		}
		if newTotal < m.threshold {
			break
		}
		out = append(out, m.label)
	}
	return out
}
