package config

import (
	"sync/atomic"
)

// EffectiveWorkerConcurrency is updated from Job Control via heartbeat (worker_concurrency).
// Asynq pool size is a fixed ceiling; this gates how many chunk tasks run SMTP work.
var EffectiveWorkerConcurrency atomic.Int64

// EffectiveWorkerRateLimitRPM is this VPS's outbound verifies/minute cap from Admin → Server.
// 0 = unlimited (no process-wide rate gate). Updated live via heartbeat.
var EffectiveWorkerRateLimitRPM atomic.Int64

func init() {
	EffectiveWorkerConcurrency.Store(10)
	EffectiveWorkerRateLimitRPM.Store(0) // unlimited until first heartbeat
}

// SetEffectiveWorkerConcurrency clamps and stores the Job Control value.
func SetEffectiveWorkerConcurrency(n int) {
	if n < 1 {
		n = 1
	}
	if n > 100 {
		n = 100
	}
	EffectiveWorkerConcurrency.Store(int64(n))
}

// GetEffectiveWorkerConcurrency returns the current Job Control concurrency.
func GetEffectiveWorkerConcurrency() int {
	n := int(EffectiveWorkerConcurrency.Load())
	if n < 1 {
		return 1
	}
	return n
}

// SetEffectiveWorkerRateLimitRPM stores verifies/minute for this worker (0 = unlimited).
func SetEffectiveWorkerRateLimitRPM(n int) {
	if n < 0 {
		n = 0
	}
	if n > 1_000_000 {
		n = 1_000_000
	}
	EffectiveWorkerRateLimitRPM.Store(int64(n))
}

// GetEffectiveWorkerRateLimitRPM returns verifies/minute (0 = unlimited).
func GetEffectiveWorkerRateLimitRPM() int {
	n := int(EffectiveWorkerRateLimitRPM.Load())
	if n < 0 {
		return 0
	}
	return n
}
