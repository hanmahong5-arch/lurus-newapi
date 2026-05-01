package middleware

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/go-redis/redis/v8"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/common"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// setupMiniRedis starts an in-memory Redis server and returns a connected client
// plus a teardown function.
func setupMiniRedis(t *testing.T) (*miniredis.Miniredis, *goredis.Client) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)

	rdb := goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rdb.Close() })
	return mr, rdb
}

// injectCostSpikeClient replaces the package-level redis getter for the duration
// of a test, restoring the original on cleanup.
func injectCostSpikeClient(t *testing.T, rdb *goredis.Client) {
	t.Helper()
	orig := costSpikeRedisClient
	costSpikeRedisClient = func() *goredis.Client { return rdb }
	t.Cleanup(func() { costSpikeRedisClient = orig })
}

// seedWindow directly inserts quota entries into the sorted set, simulating
// prior consumption within the 5-minute window.
func seedWindow(t *testing.T, rdb *goredis.Client, userID int, totalTokens int64) {
	t.Helper()
	ctx := context.Background()
	key := costSpikeKeyPrefix + strconv.Itoa(userID)
	now := time.Now().UnixMilli()
	member := fmt.Sprintf("%d:%d", now, totalTokens)
	err := rdb.ZAdd(ctx, key, &goredis.Z{Score: float64(now), Member: member}).Err()
	require.NoError(t, err)
}

// setUserID is a fake auth middleware that injects a user ID into the context.
func setUserID(userID int) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("id", userID)
		c.Next()
	}
}

// runMiddleware executes CostSpikeLimit() against a synthetic Gin context with
// the given userID set via a fake auth middleware.
func runMiddleware(t *testing.T, userID int) *httptest.ResponseRecorder {
	t.Helper()
	engine := gin.New()
	engine.POST("/v1/chat/completions",
		setUserID(userID),
		CostSpikeLimit(),
		func(c *gin.Context) { c.Status(http.StatusOK) },
	)

	req, _ := http.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

// TestCostSpikeLimit_BelowThreshold_Passes verifies that a user whose window
// consumption is below the hard limit is allowed through.
func TestCostSpikeLimit_BelowThreshold_Passes(t *testing.T) {
	_, rdb := setupMiniRedis(t)
	injectCostSpikeClient(t, rdb)

	origEnabled := common.CostSpikeProtectionEnabled
	origLimit := common.CostSpikeHardLimitPer5Min
	common.CostSpikeProtectionEnabled = true
	common.CostSpikeHardLimitPer5Min = 50000
	common.RedisEnabled = true
	defer func() {
		common.CostSpikeProtectionEnabled = origEnabled
		common.CostSpikeHardLimitPer5Min = origLimit
	}()

	userID := 1001
	// Seed 10000 tokens (well under 50000 limit).
	seedWindow(t, rdb, userID, 10000)

	rec := runMiddleware(t, userID)
	require.Equal(t, http.StatusOK, rec.Code)
}

// TestCostSpikeLimit_AtThreshold_Returns429AndDisablesUser verifies that a user
// whose 5-minute window consumption meets or exceeds the hard limit receives a
// 429 response containing the error code, and that the disable hook is called.
func TestCostSpikeLimit_AtThreshold_Returns429AndDisablesUser(t *testing.T) {
	_, rdb := setupMiniRedis(t)
	injectCostSpikeClient(t, rdb)

	origEnabled := common.CostSpikeProtectionEnabled
	origLimit := common.CostSpikeHardLimitPer5Min
	common.CostSpikeProtectionEnabled = true
	common.CostSpikeHardLimitPer5Min = 50000
	common.RedisEnabled = true
	defer func() {
		common.CostSpikeProtectionEnabled = origEnabled
		common.CostSpikeHardLimitPer5Min = origLimit
	}()

	userID := 1002
	// Seed exactly the limit.
	seedWindow(t, rdb, userID, 50000)

	var disabledID int
	origDisable := costSpikeDisableUser
	costSpikeDisableUser = func(id int) error {
		disabledID = id
		return nil
	}
	defer func() { costSpikeDisableUser = origDisable }()

	rec := runMiddleware(t, userID)
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.Contains(t, rec.Body.String(), "cost_spike_limit_exceeded")
	require.Equal(t, userID, disabledID, "user should have been disabled")
}

// TestCostSpikeLimit_WindowExpiry_OldTokensNotCounted verifies that entries
// older than 5 minutes do not count toward the current window total.
func TestCostSpikeLimit_WindowExpiry_OldTokensNotCounted(t *testing.T) {
	mr, rdb := setupMiniRedis(t)
	injectCostSpikeClient(t, rdb)

	origEnabled := common.CostSpikeProtectionEnabled
	origLimit := common.CostSpikeHardLimitPer5Min
	common.CostSpikeProtectionEnabled = true
	common.CostSpikeHardLimitPer5Min = 50000
	common.RedisEnabled = true
	defer func() {
		common.CostSpikeProtectionEnabled = origEnabled
		common.CostSpikeHardLimitPer5Min = origLimit
	}()

	userID := 1003
	key := costSpikeKeyPrefix + strconv.Itoa(userID)

	// Insert an old entry (7 minutes ago — outside the 5-minute window).
	ctx := context.Background()
	oldTs := time.Now().Add(-7 * time.Minute).UnixMilli()
	member := fmt.Sprintf("%d:%d", oldTs, 50000)
	err := rdb.ZAdd(ctx, key, &goredis.Z{Score: float64(oldTs), Member: member}).Err()
	require.NoError(t, err)

	// miniredis: fast-forward time so TTL-based expiry would also work
	// but we rely on ZREMRANGEBYSCORE in the middleware logic, not key TTL.
	_ = mr // mr available for future needs

	rec := runMiddleware(t, userID)
	// Old entries should be evicted — request must pass.
	require.Equal(t, http.StatusOK, rec.Code)
}

// TestCostSpikeLimit_ProtectionDisabled_AlwaysPasses verifies that when
// COST_SPIKE_PROTECTION_ENABLED=false the middleware is a pure no-op.
func TestCostSpikeLimit_ProtectionDisabled_AlwaysPasses(t *testing.T) {
	_, rdb := setupMiniRedis(t)
	injectCostSpikeClient(t, rdb)

	origEnabled := common.CostSpikeProtectionEnabled
	common.CostSpikeProtectionEnabled = false
	defer func() { common.CostSpikeProtectionEnabled = origEnabled }()

	userID := 1004
	// Seed way over the limit — should still pass because protection is off.
	seedWindow(t, rdb, userID, 999999)

	rec := runMiddleware(t, userID)
	require.Equal(t, http.StatusOK, rec.Code)
}
