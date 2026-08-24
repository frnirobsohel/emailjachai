package jobcontrol

import (
	"context"
	"errors"
	"time"

	"ejp-backend/pkg/config"
)

// PauseKey is the Redis flag workers check before burning SMTP on a chunk.
// Chunks may already sit in Asynq; soft-stop via this key avoids deleting
// in-flight work while still letting Resume rebuild remaining emails from source.
func PauseKey(jobID string) string {
	return "bulk:job:paused:" + jobID
}

// SetPaused marks a job paused for workers (Redis) with a long TTL safety net.
// Fails closed if Redis is unavailable — otherwise UI would show paused while workers keep SMTP.
func SetPaused(jobID string) error {
	if jobID == "" {
		return errors.New("empty job id")
	}
	if config.Redis == nil {
		return errors.New("redis unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return config.Redis.Set(ctx, PauseKey(jobID), "1", 7*24*time.Hour).Err()
}

// ClearPaused removes the worker soft-stop flag (resume / complete / fail / delete).
func ClearPaused(jobID string) {
	if config.Redis == nil || jobID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = config.Redis.Del(ctx, PauseKey(jobID)).Err()
}

// JobStatusAfterProgressSQL keeps paused jobs paused when late in-flight
// results are pushed, until the job fully completes.
const JobStatusAfterProgressSQL = "CASE WHEN processed_count + ? >= total_emails THEN 'completed' WHEN status = 'paused' THEN 'paused' ELSE 'processing' END"
