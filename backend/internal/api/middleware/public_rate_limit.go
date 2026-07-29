package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

var publicRateLimitCache struct {
	mu        sync.RWMutex
	limit     int64
	expiresAt time.Time
}

func getCachedPublicRateLimit() int64 {
	const defaultLimit = int64(5)
	const cacheTTL = 5 * time.Minute

	publicRateLimitCache.mu.RLock()
	if time.Now().Before(publicRateLimitCache.expiresAt) {
		v := publicRateLimitCache.limit
		publicRateLimitCache.mu.RUnlock()
		return v
	}
	publicRateLimitCache.mu.RUnlock()

	// Cache miss: read from DB
	limit := defaultLimit
	var setting model.Setting
	if err := config.DB.Where("setting_key = 'public_rate_limit_per_minute'").First(&setting).Error; err == nil {
		if parsed, convErr := helper.SafeAtoi(setting.SettingValue); convErr == nil && parsed > 0 {
			limit = int64(parsed)
		}
	}

	publicRateLimitCache.mu.Lock()
	publicRateLimitCache.limit = limit
	publicRateLimitCache.expiresAt = time.Now().Add(cacheTTL)
	publicRateLimitCache.mu.Unlock()

	return limit
}

// PublicRateLimiter applies a strict IP-based rate limit for unauthenticated public endpoints.
// Default: 5 requests per minute per IP. Configurable via settings table key "public_rate_limit_per_minute".
// Uses a separate Redis key prefix (pub_rate:ip:) to avoid conflicts with the global rate limiter.
// Fail-closed: if Redis is unavailable, public abuse endpoints are rejected (not opened).
func PublicRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.Redis == nil {
			helper.SendError(c, http.StatusServiceUnavailable,
				"Temporarily unavailable",
				"ERR_RATE_LIMIT_UNAVAILABLE")
			c.Abort()
			return
		}

		// Determine rate limit from cache
		limitPerMinute := getCachedPublicRateLimit()

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
			helper.SendError(c, http.StatusServiceUnavailable,
				"Temporarily unavailable",
				"ERR_RATE_LIMIT_UNAVAILABLE")
			c.Abort()
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
