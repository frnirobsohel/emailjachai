package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// PublicRateLimiter applies a strict IP-based rate limit for unauthenticated public endpoints.
// Default: 5 requests per minute per IP. Configurable via settings table key "public_rate_limit_per_minute".
// Uses a separate Redis key prefix (pub_rate:ip:) to avoid conflicts with the global rate limiter.
func PublicRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Fail-open if Redis is not available
		if config.Redis == nil {
			c.Next()
			return
		}

		// Determine rate limit from settings table (default: 5/min)
		limitPerMinute := int64(5)
		var setting model.Setting
		if err := config.DB.Where("setting_key = 'public_rate_limit_per_minute'").First(&setting).Error; err == nil {
			if parsed, convErr := helper.SafeAtoi(setting.SettingValue); convErr == nil && parsed > 0 {
				limitPerMinute = int64(parsed)
			}
		}

		key := fmt.Sprintf("pub_rate:ip:%s", c.ClientIP())
		ctx := context.Background()
		now := time.Now().UnixNano()
		clearBefore := now - int64(60*time.Second) // 60-second sliding window

		pipe := config.Redis.TxPipeline()

		// Remove entries older than 60 seconds
		pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(clearBefore, 10))

		// Add current request timestamp
		pipe.ZAdd(ctx, key, redis.Z{
			Score:  float64(now),
			Member: strconv.FormatInt(now, 10),
		})

		// Count requests in the sliding window
		cardCmd := pipe.ZCard(ctx, key)

		// Auto-expire to prevent memory leaks
		pipe.Expire(ctx, key, 70*time.Second)

		if _, err := pipe.Exec(ctx); err != nil {
			// Fail-open on Redis errors to avoid blocking legitimate users
			c.Next()
			return
		}

		count := cardCmd.Val()
		if count > limitPerMinute {
			c.Header("X-RateLimit-Limit", strconv.FormatInt(limitPerMinute, 10))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", "60")

			helper.SendError(c, http.StatusTooManyRequests,
				"Too many requests. Please wait a minute and try again.",
				"ERR_TOO_MANY_REQUESTS")
			c.Abort()
			return
		}

		c.Header("X-RateLimit-Limit", strconv.FormatInt(limitPerMinute, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(limitPerMinute-count, 10))

		c.Next()
	}
}
