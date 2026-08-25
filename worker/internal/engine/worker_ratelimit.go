package engine

import (
	"context"
	"sync"

	"ejp-worker/pkg/config"

	"golang.org/x/time/rate"
)

// Process-wide VPS connection budget (verifies/minute). Additive to per-domain RPS —
// does not replace domain limiters, concurrency gate, or warmup.
var (
	workerRLMu      sync.Mutex
	workerRL        *rate.Limiter // nil when unlimited
	workerRLApplied int           // last RPM used to build workerRL
)

func syncWorkerRateLimiter() *rate.Limiter {
	rpm := config.GetEffectiveWorkerRateLimitRPM()
	workerRLMu.Lock()
	defer workerRLMu.Unlock()
	if rpm == workerRLApplied {
		return workerRL
	}
	workerRLApplied = rpm
	if rpm <= 0 {
		workerRL = nil
		return nil
	}
	// Strict-ish for VPS port/connection caps: refill rpm/60, burst 1.
	rps := float64(rpm) / 60.0
	workerRL = rate.NewLimiter(rate.Limit(rps), 1)
	return workerRL
}

// WaitWorkerRateLimit blocks until this VPS's verifies/minute budget allows another probe.
// 0 RPM (unlimited) returns immediately. Wait is outside the 135s probe clock.
func WaitWorkerRateLimit(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	lim := syncWorkerRateLimiter()
	if lim == nil {
		return nil
	}
	return lim.Wait(ctx)
}
