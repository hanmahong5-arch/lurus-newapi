package service

import (
	"context"
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestCrossedMilestones_NoCrossings(t *testing.T) {
	// Both totals well below the first threshold.
	got := crossedMilestones(100, 500)
	if len(got) != 0 {
		t.Errorf("got %v, want []", got)
	}
}

func TestCrossedMilestones_FirstTier(t *testing.T) {
	got := crossedMilestones(900, 1500)
	if !reflect.DeepEqual(got, []string{"first_1k"}) {
		t.Errorf("got %v, want [first_1k]", got)
	}
}

func TestCrossedMilestones_SkipAlreadyCrossedLowerTier(t *testing.T) {
	// User crossed 1k a long time ago; this request crosses 10k.
	got := crossedMilestones(5_000, 12_000)
	if !reflect.DeepEqual(got, []string{"first_10k"}) {
		t.Errorf("got %v, want [first_10k]", got)
	}
}

func TestCrossedMilestones_SingleRequestCrossesMultipleTiers(t *testing.T) {
	// Fresh account, 200k tokens in one shot.
	got := crossedMilestones(0, 200_000)
	want := []string{"first_1k", "first_10k", "first_100k"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestCrossedMilestones_ExactBoundaryCrosses(t *testing.T) {
	// (prev, new] semantics: exactly hitting the threshold counts.
	got := crossedMilestones(999, 1000)
	if !reflect.DeepEqual(got, []string{"first_1k"}) {
		t.Errorf("got %v, want [first_1k]", got)
	}
}

func TestCrossedMilestones_AllTiersInOneShot(t *testing.T) {
	got := crossedMilestones(0, 2_000_000)
	want := []string{"first_1k", "first_10k", "first_100k", "first_1m"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestMilestoneThresholds_SortedAndComplete(t *testing.T) {
	got := MilestoneThresholds()
	want := []int64{1_000, 10_000, 100_000, 1_000_000}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestCheckAndPublishUsageMilestone_NoOpWhenRedisDisabled(t *testing.T) {
	// When Redis is not enabled, the function must return without panicking
	// and without invoking the publisher.
	fp := withFakePublisher(t)

	prevEnabled := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = prevEnabled })

	CheckAndPublishUsageMilestone(context.Background(), 1, 1500)

	if calls := fp.snapshot(); len(calls) != 0 {
		t.Errorf("expected no publish when redis disabled, got %d", len(calls))
	}
}

func TestCheckAndPublishUsageMilestone_NoOpForZeroOrNegative(t *testing.T) {
	fp := withFakePublisher(t)
	CheckAndPublishUsageMilestone(context.Background(), 0, 100)
	CheckAndPublishUsageMilestone(context.Background(), -1, 100)
	CheckAndPublishUsageMilestone(context.Background(), 1, 0)
	CheckAndPublishUsageMilestone(context.Background(), 1, -5)
	if calls := fp.snapshot(); len(calls) != 0 {
		t.Errorf("expected no publishes for invalid args, got %d", len(calls))
	}
}
