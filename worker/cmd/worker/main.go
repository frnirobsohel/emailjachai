package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ejp-worker/internal/queue"
	"ejp-worker/internal/reporter"
	"ejp-worker/internal/retry"
	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"
	"ejp-worker/pkg/safe"

	"github.com/hibiken/asynq"
	"go.uber.org/zap"
)

func main() {
	// 1. Initialize Logger
	logger.Init()
	defer logger.Log.Sync()

	// 2. Load Configuration
	config.LoadConfig()

	redisOpt, err := asynq.ParseRedisURI(config.Cfg.RedisURL)
	if err != nil {
		logger.Fatal("failed to parse redis url", zap.Error(err))
	}

	// 3. Heartbeat first so Disable is known before any queue work / self-heal.
	reporter.HeartbeatOnce()

	// 4. Self-heal only when enabled (disabled = heartbeat-only).
	reporter.SelfHeal()

	// 5. Background routines (domain refresh no-ops while disabled)
	safe.Go(reporter.UpdateDomainCache)
	safe.Go(reporter.StartHeartbeat)

	mux := asynq.NewServeMux()
	mux.HandleFunc("email:verify", queue.HandleEmailVerifyTask)
	mux.HandleFunc("email:chunk:verify", queue.HandleEmailChunkTask)
	mux.HandleFunc("webhook:deliver", queue.HandleWebhookTask)

	fmt.Println("Starting Standalone Email Verification Worker...")
	logger.Info("Starting Worker",
		zap.String("server_name", config.Cfg.WorkerServerName),
		zap.Int("asynq_pool", config.Cfg.Concurrency),
		zap.Int("effective_concurrency", config.GetEffectiveWorkerConcurrency()),
		zap.Bool("enabled", config.IsWorkerEnabled()),
	)

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	// 6. Asynq only while enabled — disable = idle (heartbeat continues in background).
	runAsynqWhileEnabled(redisOpt, mux, sigs)

	fmt.Println("Shutting down worker...")
	logger.Info("Shutting down worker...")
}

func runAsynqWhileEnabled(redisOpt asynq.RedisConnOpt, mux *asynq.ServeMux, sigs <-chan os.Signal) {
	wasEnabled := false
	for {
		select {
		case <-sigs:
			return
		default:
		}

		if !config.IsWorkerEnabled() {
			if wasEnabled {
				logger.Warn("Worker disabled — stopped queue consumers (heartbeat only)")
				wasEnabled = false
			}
			select {
			case <-sigs:
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}

		srv := asynq.NewServer(
			redisOpt,
			asynq.Config{
				Concurrency: config.Cfg.Concurrency,
				Queues: map[string]int{
					"critical": 6,
					"default":  3,
					"low":      1,
				},
				Logger:         newAsynqLogger(),
				RetryDelayFunc: retry.AsynqRetryDelayFunc(),
				ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
					retried, _ := asynq.GetRetryCount(ctx)
					maxRetry, _ := asynq.GetMaxRetry(ctx)
					if retried >= maxRetry {
						logger.Error("Task exhausted all retries (Dead-Letter Queue)",
							zap.String("type", task.Type()),
							zap.Error(err),
						)
						queue.HandleDeadLetterTask(ctx, task, err)
					}
				}),
			},
		)

		if err := srv.Start(mux); err != nil {
			logger.Error("could not start asynq server", zap.Error(err))
			select {
			case <-sigs:
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}

		if !wasEnabled {
			logger.Info("Worker enabled — queue consumers started")
			// Catch tasks abandoned while we were offline/disabled.
			reporter.SelfHeal()
		}
		wasEnabled = true

		for config.IsWorkerEnabled() {
			select {
			case <-sigs:
				srv.Shutdown()
				return
			case <-time.After(2 * time.Second):
			}
		}

		logger.Warn("Admin disabled this worker — shutting down queue consumers")
		srv.Shutdown()
	}
}

// asynqLogger bridges asynq internal logs to our zap logger
type asynqLogger struct{}

func newAsynqLogger() *asynqLogger {
	return &asynqLogger{}
}

func (l *asynqLogger) Debug(args ...interface{}) {
	logger.Debug(fmt.Sprint(args...))
}

func (l *asynqLogger) Info(args ...interface{}) {
	logger.Info(fmt.Sprint(args...))
}

func (l *asynqLogger) Warn(args ...interface{}) {
	logger.Warn(fmt.Sprint(args...))
}

func (l *asynqLogger) Error(args ...interface{}) {
	logger.Error(fmt.Sprint(args...))
}

func (l *asynqLogger) Fatal(args ...interface{}) {
	logger.Fatal(fmt.Sprint(args...))
}
