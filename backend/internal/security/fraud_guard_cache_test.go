package security

import (
	"testing"
	"time"
)

func TestClearDailyFreeLimitCache(t *testing.T) {
	dailyFreeLimitCache.mu.Lock()
	dailyFreeLimitCache.limit = 15
	dailyFreeLimitCache.expiresAt = time.Now().Add(5 * time.Minute)
	dailyFreeLimitCache.mu.Unlock()

	ClearDailyFreeLimitCache()

	dailyFreeLimitCache.mu.RLock()
	defer dailyFreeLimitCache.mu.RUnlock()
	if !dailyFreeLimitCache.expiresAt.IsZero() {
		t.Fatalf("expected expiresAt to be zero after clear, got %v", dailyFreeLimitCache.expiresAt)
	}
}
