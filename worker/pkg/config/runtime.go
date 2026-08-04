package config

import (
	"sync/atomic"
)

// EffectiveWorkerConcurrency is updated from Job Control via heartbeat (worker_concurrency).
// Asynq pool size is a fixed ceiling; this gates how many chunk tasks run SMTP work.
var EffectiveWorkerConcurrency atomic.Int64

func init() {
	EffectiveWorkerConcurrency.Store(10)
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
