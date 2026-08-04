package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"ejp-backend/internal/tasks"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"

	"github.com/hibiken/asynq"
)

const prepareAsynqMaxConcurrency = 10

var (
	prepareLimitCache struct {
		mu        sync.Mutex
		limit     int
		expiresAt time.Time
	}
)

func cachedPrepareConcurrency() int {
	prepareLimitCache.mu.Lock()
	defer prepareLimitCache.mu.Unlock()
	if time.Now().Before(prepareLimitCache.expiresAt) && prepareLimitCache.limit > 0 {
		return prepareLimitCache.limit
	}
	limit := 1
	if config.DB != nil {
		var val string
		if err := config.DB.Table("settings").Select("setting_value").
			Where("setting_key = ?", "prepare_concurrency").
			Scan(&val).Error; err == nil {
			if n, err := strconv.Atoi(val); err == nil && n > 0 {
				limit = n
			}
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > prepareAsynqMaxConcurrency {
		limit = prepareAsynqMaxConcurrency
	}
	prepareLimitCache.limit = limit
	prepareLimitCache.expiresAt = time.Now().Add(15 * time.Second)
	return limit
}

// StartBulkPrepareWorker runs a dedicated Asynq consumer for job:bulk:prepare.
// Effective parallelism is Job Control prepare_concurrency via a Redis cluster slot.
func StartBulkPrepareWorker(jobService JobService) {
	if config.Redis == nil {
		logger.Warn("Bulk prepare worker not started: Redis unavailable")
		return
	}

	opt := config.Redis.Options()
	redisOpt := asynq.RedisClientOpt{
		Addr:     opt.Addr,
		Password: opt.Password,
		DB:       opt.DB,
	}

	srv := asynq.NewServer(redisOpt, asynq.Config{
		Concurrency: prepareAsynqMaxConcurrency,
		Queues: map[string]int{
			"prepare": 1,
		},
		ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
			retried, _ := asynq.GetRetryCount(ctx)
			maxRetry, _ := asynq.GetMaxRetry(ctx)
			if retried < maxRetry {
				return
			}
			logger.Error("Bulk prepare task exhausted retries",
				"type", task.Type(),
				"error", err,
			)
			failPrepareJobAfterExhaustion(jobService, task)
		}),
	})

	mux := asynq.NewServeMux()
	mux.HandleFunc(tasks.TypeBulkPrepare, func(ctx context.Context, t *asynq.Task) error {
		var p tasks.BulkPreparePayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("invalid prepare payload: %w", err)
		}
		if p.JobID == "" {
			return fmt.Errorf("missing job_id in prepare payload")
		}

		limit := cachedPrepareConcurrency()
		releaseSlot, slotErr := acquireClusterPrepareSlot(limit)
		if slotErr != nil {
			// Busy or Redis blip → retry; do not mark prepare complete
			return slotErr
		}
		defer releaseSlot()

		logger.Info("Preparing bulk job", "job_id", p.JobID, "prepare_concurrency", limit)
		if err := jobService.PrepareBulkJob(p.JobID); err != nil {
			if errors.Is(err, errPrepareLockBusy) || errors.Is(err, errPrepareSlotBusy) {
				return err
			}
			logger.Error("Bulk prepare failed", "job_id", p.JobID, "error", err)
			return err
		}
		logger.Info("Bulk prepare completed", "job_id", p.JobID)
		return nil
	})

	safe.Go(func() {
		logger.Info("Starting bulk prepare worker",
			"asynq_pool", prepareAsynqMaxConcurrency,
			"queue", "prepare",
		)
		if err := srv.Run(mux); err != nil {
			logger.Error("Bulk prepare worker stopped", "error", err)
		}
	})
}

func failPrepareJobAfterExhaustion(jobService JobService, task *asynq.Task) {
	if task == nil || task.Type() != tasks.TypeBulkPrepare {
		return
	}
	var p tasks.BulkPreparePayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil || p.JobID == "" {
		return
	}
	if err := jobService.FailPreparingJob(p.JobID, "prepare exhausted retries"); err != nil {
		logger.Error("Exhausted prepare: refund/fail failed", "job_id", p.JobID, "error", err)
	}
}
