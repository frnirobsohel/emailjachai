package config

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

type CachedAPIAuth struct {
	UserID    uint
	Role      string
	APIKeyID  uint
	ExpiresAt time.Time
}

var (
	apiAuthCache      = make(map[string]CachedAPIAuth)
	apiAuthCacheMutex sync.RWMutex
)

func apiAuthCacheKey(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func GetCachedAPIAuth(token string) (CachedAPIAuth, bool) {
	key := apiAuthCacheKey(token)

	apiAuthCacheMutex.RLock()
	entry, ok := apiAuthCache[key]
	apiAuthCacheMutex.RUnlock()
	if !ok {
		return CachedAPIAuth{}, false
	}

	if time.Now().After(entry.ExpiresAt) {
		apiAuthCacheMutex.Lock()
		delete(apiAuthCache, key)
		apiAuthCacheMutex.Unlock()
		return CachedAPIAuth{}, false
	}

	return entry, true
}

func SetCachedAPIAuth(token string, entry CachedAPIAuth, ttl time.Duration) {
	if ttl <= 0 {
		return
	}

	entry.ExpiresAt = time.Now().Add(ttl)

	apiAuthCacheMutex.Lock()
	apiAuthCache[apiAuthCacheKey(token)] = entry
	apiAuthCacheMutex.Unlock()
}

func ClearCachedAPIAuth(token string) {
	apiAuthCacheMutex.Lock()
	delete(apiAuthCache, apiAuthCacheKey(token))
	apiAuthCacheMutex.Unlock()
}



