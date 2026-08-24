package jobcontrol

import (
	"context"
	"sync"
	"time"

	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const pauseKeyPrefix = "bulk:job:paused:"

var (
	pauseRDB     *redis.Client
	pauseRDBOnce sync.Once

	// Short local cache so large chunks do not hit Redis on every email spawn.
	pauseCache   sync.Map // jobID -> pauseCacheEntry
	pauseCacheTTL = 2 * time.Second
)

type pauseCacheEntry struct {
	paused bool
	at     time.Time
}

func pauseRedis() *redis.Client {
	pauseRDBOnce.Do(func() {
		if config.Cfg == nil || config.Cfg.RedisURL == "" {
			return
		}
		opt, err := redis.ParseURL(config.Cfg.RedisURL)
		if err != nil {
			logger.Warn("job pause: invalid redis URL", zap.Error(err))
			return
		}
		pauseRDB = redis.NewClient(opt)
	})
	return pauseRDB
}

// IsPaused reports whether the API set the soft-stop flag for this job.
// Chunks already in Asynq ACK without SMTP; Resume rebuilds remaining work from source.
func IsPaused(jobID string) bool {
	if jobID == "" {
		return false
	}
	if v, ok := pauseCache.Load(jobID); ok {
		e := v.(pauseCacheEntry)
		if time.Since(e.at) < pauseCacheTTL {
			return e.paused
		}
	}

	rdb := pauseRedis()
	if rdb == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	val, err := rdb.Get(ctx, pauseKeyPrefix+jobID).Result()
	if err == redis.Nil {
		pauseCache.Store(jobID, pauseCacheEntry{paused: false, at: time.Now()})
		return false
	}
	if err != nil {
		logger.Warn("job pause: redis check failed", zap.String("job_id", jobID), zap.Error(err))
		// Fail-open: keep verifying rather than stalling the whole worker fleet.
		return false
	}
	paused := val != ""
	pauseCache.Store(jobID, pauseCacheEntry{paused: paused, at: time.Now()})
	return paused
}
