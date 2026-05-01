package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	goredis "github.com/go-redis/redis/v8"
	"github.com/gin-gonic/gin"
)

const (
	costSpikeKeyPrefix  = "cost_spike:user:"
	costSpikeWindowSecs = 5 * 60
	costSpikeTTLSecs    = 600
)

// costSpikeRedisClient is the Redis client used by the middleware.
// Replaced in tests with a miniredis-backed client.
var costSpikeRedisClient func() *goredis.Client = func() *goredis.Client {
	return common.RDB
}

// costSpikeDisableUser disables a user account by ID.
// Replaced in tests with a no-op or recorder.
var costSpikeDisableUser func(userID int) error = func(userID int) error {
	return model.DisableUserByID(userID)
}

// queryCostSpikeWindow returns the total tokens consumed by userID in the
// last 5 minutes using a Redis sorted set sliding window.
// It also evicts entries older than the window before summing.
func queryCostSpikeWindow(ctx context.Context, rdb *goredis.Client, userID int) (int64, error) {
	key := costSpikeKeyPrefix + strconv.Itoa(userID)
	cutoff := time.Now().Add(-costSpikeWindowSecs * time.Second).UnixMilli()

	// Remove expired entries from the sorted set.
	if err := rdb.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(cutoff, 10)).Err(); err != nil {
		return 0, fmt.Errorf("cost_spike zremrangebyscore: %w", err)
	}

	// Fetch all remaining members and sum their token counts.
	members, err := rdb.ZRange(ctx, key, 0, -1).Result()
	if err != nil {
		return 0, fmt.Errorf("cost_spike zrange: %w", err)
	}

	var total int64
	for _, m := range members {
		// member format: "<ts_ms>:<tokens>"
		parts := strings.SplitN(m, ":", 2)
		if len(parts) != 2 {
			continue
		}
		tokens, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			continue
		}
		total += tokens
	}
	return total, nil
}

// CostSpikeLimit is a Gin middleware that blocks LLM requests when a user
// exceeds the configured quota in the sliding 5-minute window.
// It must be placed after TokenAuth (which sets the "id" context key).
func CostSpikeLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !common.CostSpikeProtectionEnabled {
			c.Next()
			return
		}

		userID := c.GetInt("id")
		if userID == 0 {
			// Not authenticated — let downstream middleware handle it.
			c.Next()
			return
		}

		if !common.RedisEnabled {
			// No Redis, protection cannot function — fail open (allow).
			c.Next()
			return
		}

		ctx := c.Request.Context()
		rdb := costSpikeRedisClient()
		windowUsed, err := queryCostSpikeWindow(ctx, rdb, userID)
		if err != nil {
			// Log and fail open to avoid blocking legitimate traffic on Redis errors.
			logger.LogWarn(ctx, fmt.Sprintf("cost_spike check error user %d: %s", userID, err.Error()))
			c.Next()
			return
		}

		limit := int64(common.CostSpikeHardLimitPer5Min)
		if windowUsed >= limit {
			// Auto-disable the user account.
			if disableErr := costSpikeDisableUser(userID); disableErr != nil {
				logger.LogWarn(ctx, fmt.Sprintf("cost_spike disable user %d failed: %s", userID, disableErr.Error()))
			}

			logger.LogWarn(ctx, fmt.Sprintf(
				`{"event":"cost_spike_triggered","user_id":%d,"window_used":%d,"limit":%d,"action":"auto_disabled"}`,
				userID, windowUsed, limit,
			))

			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"message": "cost spike limit exceeded; account temporarily disabled for safety",
					"type":    "new_api_error",
					"code":    "cost_spike_limit_exceeded",
				},
			})
			return
		}

		c.Next()
	}
}
