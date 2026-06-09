package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimiter implements a Redis-backed sliding window rate limiter with Admin bypass.
func RateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Check if Redis is initialized (fail-open if Redis is down)
		if config.Redis == nil {
			c.Next()
			return
		}

		// Fast Path: Bypass worker nodes and background queue callbacks
		path := c.Request.URL.Path
		if strings.Contains(path, "/worker/") || strings.Contains(path, "/internal/") || strings.Contains(path, "/jobs/push") {
			c.Next()
			return
		}

		// 2. Admin Bypass: Admins are not subject to rate limits
		if role, exists := c.Get("role"); exists && role == "admin" {
			c.Next()
			return
		}

		// 3. Determine Rate Limit Key (userID if authenticated, IP address if guest)
		key := ""
		if userID, exists := c.Get("userID"); exists {
			key = fmt.Sprintf("rate_limit:user:%v", userID)
		} else {
			key = fmt.Sprintf("rate_limit:ip:%s", c.ClientIP())
		}

		// 4. Fetch dynamic rate limits from Settings table
		limitPerMinute := int64(120) // default limit: 120 req/min
		var setting model.Setting
		if err := config.DB.Where("setting_key = 'rate_limit_per_minute'").First(&setting).Error; err == nil {
			if parsed, convErr := strconv.ParseInt(setting.SettingValue, 10, 64); convErr == nil && parsed > 0 {
				limitPerMinute = parsed
			}
		}

		ctx := context.Background()
		now := time.Now().UnixNano()
		clearBefore := now - int64(60*time.Second) // 60 seconds sliding window

		// 5. Redis sorted-set pipeline execution
		pipe := config.Redis.TxPipeline()
		
		// Remove entries older than 60 seconds
		pipe.ZRemRangeByScore(ctx, key, "-inf", strconv.FormatInt(clearBefore, 10))
		
		// Add current request timestamp
		pipe.ZAdd(ctx, key, redis.Z{
			Score:  float64(now),
			Member: strconv.FormatInt(now, 10),
		})
		
		// Count request quantity in sliding window
		cardCmd := pipe.ZCard(ctx, key)
		
		// Auto-expire set to prevent memory leaks
		pipe.Expire(ctx, key, 70*time.Second)

		_, err := pipe.Exec(ctx)
		if err != nil {
			// Fail-open to avoid service outage on cache struggles
			c.Next()
			return
		}

		count := cardCmd.Val()
		if count > limitPerMinute {
			c.Header("X-RateLimit-Limit", strconv.FormatInt(limitPerMinute, 10))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", "60")

			helper.SendError(c, http.StatusTooManyRequests, "Too many requests. Please wait a minute and try again.", "ERR_TOO_MANY_REQUESTS")
			c.Abort()
			return
		}

		// Success: set standard rate limit headers
		c.Header("X-RateLimit-Limit", strconv.FormatInt(limitPerMinute, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(limitPerMinute-count, 10))

		c.Next()
	}
}
