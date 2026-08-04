package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"
)

var (
	errPrepareLockBusy = errors.New("prepare lock busy")
	errPrepareSlotBusy = errors.New("prepare concurrency slot busy")
)

const (
	prepareLockTTL    = 30 * time.Minute
	prepareLockRefresh = 2 * time.Minute
	prepareSourceTTL  = 48 * time.Hour
)

var redisUnlockScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`

// acquirePrepareJobLock takes a per-job Redis lock with token + TTL refresh.
// On lock busy or Redis error it returns an error so Asynq retries (never silent success).
func acquirePrepareJobLock(jobID string) (release func(), err error) {
	if config.Redis == nil {
		return func() {}, nil
	}
	lockKey := fmt.Sprintf("bulk:prepare:lock:%s", jobID)
	token := helper.GenerateRandomHex(16)

	ok, lockErr := config.Redis.SetNX(config.Ctx, lockKey, token, prepareLockTTL).Result()
	if lockErr != nil {
		return nil, fmt.Errorf("prepare lock unavailable: %w", lockErr)
	}
	if !ok {
		return nil, errPrepareLockBusy
	}

	stop := make(chan struct{})
	safe.Go(func() {
		ticker := time.NewTicker(prepareLockRefresh)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				val, gerr := config.Redis.Get(config.Ctx, lockKey).Result()
				if gerr != nil || val != token {
					return
				}
				_ = config.Redis.Expire(config.Ctx, lockKey, prepareLockTTL).Err()
			}
		}
	})

	release = func() {
		close(stop)
		if _, uerr := config.Redis.Eval(config.Ctx, redisUnlockScript, []string{lockKey}, token).Result(); uerr != nil {
			logger.Warn("prepare lock unlock failed", "job_id", jobID, "error", uerr)
		}
	}
	return release, nil
}

// acquireClusterPrepareSlot enforces Job Control prepare_concurrency across all API replicas.
func acquireClusterPrepareSlot(limit int) (release func(), err error) {
	if limit < 1 {
		limit = 1
	}
	if config.Redis == nil {
		// Single-node / no Redis: allow (local gate unused)
		return func() {}, nil
	}
	key := "bulk:prepare:active"
	n, ierr := config.Redis.Incr(config.Ctx, key).Result()
	if ierr != nil {
		return nil, fmt.Errorf("prepare slot unavailable: %w", ierr)
	}
	// Keep key alive even if workers die mid-flight
	_ = config.Redis.Expire(config.Ctx, key, 2*time.Hour).Err()

	if n > int64(limit) {
		_ = config.Redis.Decr(config.Ctx, key).Err()
		return nil, errPrepareSlotBusy
	}

	release = func() {
		if _, derr := config.Redis.Decr(context.Background(), key).Result(); derr != nil {
			logger.Warn("prepare slot release failed", "error", derr)
		}
	}
	return release, nil
}

func bulkSourceRedisKey(jobID string) string {
	return "bulk:source:" + jobID
}

func cacheBulkSourceEmails(jobID string, emails []string) {
	if config.Redis == nil || len(emails) == 0 {
		return
	}
	// Join with newlines — same format as source file
	payload := make([]byte, 0, len(emails)*24)
	for i, e := range emails {
		if i > 0 {
			payload = append(payload, '\n')
		}
		payload = append(payload, e...)
	}
	if err := config.Redis.Set(config.Ctx, bulkSourceRedisKey(jobID), string(payload), prepareSourceTTL).Err(); err != nil {
		logger.Warn("failed to cache bulk source in redis", "job_id", jobID, "error", err)
	}
}

func loadBulkSourceFromRedis(jobID string) ([]string, bool) {
	if config.Redis == nil {
		return nil, false
	}
	val, err := config.Redis.Get(config.Ctx, bulkSourceRedisKey(jobID)).Result()
	if err != nil || val == "" {
		return nil, false
	}
	lines := splitNonEmptyLines(val)
	return lines, len(lines) > 0
}

func clearBulkSourceRedis(jobID string) {
	if config.Redis == nil {
		return
	}
	_ = config.Redis.Del(config.Ctx, bulkSourceRedisKey(jobID)).Err()
}

func splitNonEmptyLines(s string) []string {
	out := make([]string, 0)
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			if line != "" {
				out = append(out, line)
			}
			start = i + 1
		}
	}
	return out
}
