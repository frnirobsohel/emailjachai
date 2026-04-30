package config

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	statsCache = make(map[uint]cachedStats)
	cacheMutex sync.RWMutex
)

type cachedStats struct {
	Data      gin.H
	ExpiresAt time.Time
}

func GetCachedStats(userID uint) (gin.H, bool) {
	cacheMutex.RLock()
	defer cacheMutex.RUnlock()
	
	cached, ok := statsCache[userID]
	if ok && time.Now().Before(cached.ExpiresAt) {
		return cached.Data, true
	}
	return nil, false
}

func SetCachedStats(userID uint, data gin.H, duration time.Duration) {
	cacheMutex.Lock()
	defer cacheMutex.Unlock()
	
	statsCache[userID] = cachedStats{
		Data:      data,
		ExpiresAt: time.Now().Add(duration),
	}
}

func ClearDashboardCache(userID uint) {
	cacheMutex.Lock()
	defer cacheMutex.Unlock()
	delete(statsCache, userID)
}



