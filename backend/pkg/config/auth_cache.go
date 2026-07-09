package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type CachedAPIAuth struct {
	UserID    uint      `json:"user_id"`
	Role      string    `json:"role"`
	APIKeyID  uint      `json:"api_key_id"`
	ExpiresAt time.Time `json:"expires_at"`
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
	if Redis != nil {
		key := "api_auth:token:" + apiAuthCacheKey(token)
		data, err := Redis.Get(Ctx, key).Bytes()
		if err != nil {
			return CachedAPIAuth{}, false
		}
		var entry CachedAPIAuth
		if err := json.Unmarshal(data, &entry); err != nil {
			return CachedAPIAuth{}, false
		}
		return entry, true
	}

	// Fallback for tests/in-memory mode when Redis is offline
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

	if Redis != nil {
		tokenHash := apiAuthCacheKey(token)
		tokenKey := "api_auth:token:" + tokenHash
		data, err := json.Marshal(entry)
		if err == nil {
			Redis.Set(Ctx, tokenKey, data, ttl)
			setKey := fmt.Sprintf("api_auth:key_id:%d", entry.APIKeyID)
			Redis.SAdd(Ctx, setKey, tokenHash)
			Redis.Expire(Ctx, setKey, ttl+time.Minute)
		}
		return
	}

	apiAuthCacheMutex.Lock()
	apiAuthCache[apiAuthCacheKey(token)] = entry
	apiAuthCacheMutex.Unlock()
}

func ClearCachedAPIAuth(token string) {
	if Redis != nil {
		tokenHash := apiAuthCacheKey(token)
		Redis.Del(Ctx, "api_auth:token:"+tokenHash)
		return
	}

	apiAuthCacheMutex.Lock()
	delete(apiAuthCache, apiAuthCacheKey(token))
	apiAuthCacheMutex.Unlock()
}

// ClearCachedAPIAuthByKeyID scans the cache and removes all entries
// that belong to the given API key ID. Called on revoke/rotate so the old key
// stops working immediately instead of waiting for its 2-minute TTL.
func ClearCachedAPIAuthByKeyID(apiKeyID uint) {
	if Redis != nil {
		setKey := fmt.Sprintf("api_auth:key_id:%d", apiKeyID)
		tokenHashes, err := Redis.SMembers(Ctx, setKey).Result()
		if err == nil && len(tokenHashes) > 0 {
			keysToDelete := make([]string, 0, len(tokenHashes)+1)
			for _, h := range tokenHashes {
				keysToDelete = append(keysToDelete, "api_auth:token:"+h)
			}
			keysToDelete = append(keysToDelete, setKey)
			Redis.Del(Ctx, keysToDelete...)
		}
		return
	}

	apiAuthCacheMutex.Lock()
	defer apiAuthCacheMutex.Unlock()
	for k, entry := range apiAuthCache {
		if entry.APIKeyID == apiKeyID {
			delete(apiAuthCache, k)
		}
	}
}
