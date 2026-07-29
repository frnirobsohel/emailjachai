package config

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

func dashboardStatsKey(userID uint, tz string) string {
	if tz == "" {
		tz = "UTC"
	}
	return fmt.Sprintf("dashboard_stats:%d:%s", userID, tz)
}

func dashboardTZKey(userID uint) string {
	return fmt.Sprintf("dashboard_stats_tz:%d", userID)
}

func GetCachedStats(userID uint, tz string) (gin.H, bool) {
	key := dashboardStatsKey(userID, tz)
	val, err := Redis.Get(Ctx, key).Result()
	if err == nil && val != "" {
		var cached gin.H
		if err := json.Unmarshal([]byte(val), &cached); err == nil {
			return cached, true
		}
	}
	return nil, false
}

func SetCachedStats(userID uint, tz string, data gin.H, duration time.Duration) {
	key := dashboardStatsKey(userID, tz)
	if dataBytes, err := json.Marshal(data); err == nil {
		Redis.Set(Ctx, key, dataBytes, duration)
	}
	if tz != "" {
		Redis.Set(Ctx, dashboardTZKey(userID), tz, 30*24*time.Hour)
	}
}

// GetDashboardTimezone returns the last timezone used for this user's stats (browser tz).
func GetDashboardTimezone(userID uint) string {
	val, err := Redis.Get(Ctx, dashboardTZKey(userID)).Result()
	if err != nil || val == "" {
		return ""
	}
	return val
}

func ClearDashboardCache(userID uint) {
	// Drop legacy + any timezone-scoped keys. Keep preferred tz for refresh.
	keys := []string{fmt.Sprintf("dashboard_stats:%d", userID)}
	pattern := fmt.Sprintf("dashboard_stats:%d:*", userID)
	var cursor uint64
	for {
		batch, next, err := Redis.Scan(Ctx, cursor, pattern, 100).Result()
		if err != nil {
			break
		}
		keys = append(keys, batch...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	if len(keys) > 0 {
		Redis.Del(Ctx, keys...)
	}
}

func GetCachedAdminStats() (gin.H, bool) {
	key := "admin_stats"
	val, err := Redis.Get(Ctx, key).Result()
	if err == nil && val != "" {
		var cached gin.H
		if err := json.Unmarshal([]byte(val), &cached); err == nil {
			return cached, true
		}
	}
	return nil, false
}

func SetCachedAdminStats(data interface{}, duration time.Duration) {
	key := "admin_stats"
	if dataBytes, err := json.Marshal(data); err == nil {
		Redis.Set(Ctx, key, dataBytes, duration)
	}
}

func ClearAdminCache() {
	Redis.Del(Ctx, "admin_stats")
}
