package config

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
)

func GetCachedStats(userID uint) (gin.H, bool) {
	key := fmt.Sprintf("dashboard_stats:%d", userID)
	val, err := Redis.Get(Ctx, key).Result()
	if err == nil && val != "" {
		var cached gin.H
		if err := json.Unmarshal([]byte(val), &cached); err == nil {
			return cached, true
		}
	}
	return nil, false
}

func SetCachedStats(userID uint, data gin.H, duration time.Duration) {
	key := fmt.Sprintf("dashboard_stats:%d", userID)
	if dataBytes, err := json.Marshal(data); err == nil {
		Redis.Set(Ctx, key, dataBytes, duration)
	}
}

func ClearDashboardCache(userID uint) {
	key := fmt.Sprintf("dashboard_stats:%d", userID)
	Redis.Del(Ctx, key)
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
