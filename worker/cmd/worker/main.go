package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"ejp-worker/internal/queue"
	"ejp-worker/internal/reporter"
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

	// 3. Run Self-Healing: Reset previous tasks assigned to this worker server
	reporter.SelfHeal()

	// 4. Start Background Routines
	safe.Go(reporter.UpdateDomainCache)
	safe.Go(reporter.StartHeartbeat)

	// 5. Configure Asynq Server
	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: config.Cfg.Concurrency,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
			Logger: newAsynqLogger(), // Bridge Asynq internal logs to zap
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

	// 6. Register Handlers
	mux := asynq.NewServeMux()
	mux.HandleFunc("email:verify", queue.HandleEmailVerifyTask)
	mux.HandleFunc("email:chunk:verify", queue.HandleEmailChunkTask)
	mux.HandleFunc("webhook:deliver", queue.HandleWebhookTask)

	fmt.Println("Starting Standalone Email Verification Worker...")
	logger.Info("Starting Worker",
		zap.String("server_name", config.Cfg.WorkerServerName),
		zap.Int("asynq_pool", config.Cfg.Concurrency),
		zap.Int("effective_concurrency", config.GetEffectiveWorkerConcurrency()),
	)

	if err := srv.Start(mux); err != nil {
		logger.Fatal("could not start server", zap.Error(err))
	}

	// 7. Graceful Shutdown
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs
	fmt.Println("Shutting down worker...")
	logger.Info("Shutting down worker...")
	srv.Shutdown()
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
