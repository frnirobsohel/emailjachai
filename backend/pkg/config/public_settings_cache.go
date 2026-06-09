package config

import (
	"encoding/json"
	"time"
)

func GetCachedPublicSettings() (map[string]string, bool) {
	val, err := Redis.Get(Ctx, "public_settings").Result()
	if err == nil && val != "" {
		var cached map[string]string
		if err := json.Unmarshal([]byte(val), &cached); err == nil {
			return cached, true
		}
	}
	return nil, false
}

func SetCachedPublicSettings(data map[string]string, ttl time.Duration) {
	if ttl <= 0 {
		return
	}
	if dataBytes, err := json.Marshal(data); err == nil {
		Redis.Set(Ctx, "public_settings", dataBytes, ttl)
	}
}

func ClearPublicSettingsCache() {
	Redis.Del(Ctx, "public_settings")
}
