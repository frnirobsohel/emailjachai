package config

import (
	"sync"
	"time"
)

var (
	publicSettingsCache      map[string]string
	publicSettingsExpiresAt  time.Time
	publicSettingsCacheMutex sync.RWMutex
)

func GetCachedPublicSettings() (map[string]string, bool) {
	publicSettingsCacheMutex.RLock()
	defer publicSettingsCacheMutex.RUnlock()

	if publicSettingsCache == nil || time.Now().After(publicSettingsExpiresAt) {
		return nil, false
	}

	cloned := make(map[string]string, len(publicSettingsCache))
	for k, v := range publicSettingsCache {
		cloned[k] = v
	}

	return cloned, true
}

func SetCachedPublicSettings(data map[string]string, ttl time.Duration) {
	if ttl <= 0 {
		return
	}

	cloned := make(map[string]string, len(data))
	for k, v := range data {
		cloned[k] = v
	}

	publicSettingsCacheMutex.Lock()
	publicSettingsCache = cloned
	publicSettingsExpiresAt = time.Now().Add(ttl)
	publicSettingsCacheMutex.Unlock()
}

func ClearPublicSettingsCache() {
	publicSettingsCacheMutex.Lock()
	publicSettingsCache = nil
	publicSettingsExpiresAt = time.Time{}
	publicSettingsCacheMutex.Unlock()
}



