package config

import (
	"context"
	"os"
	"time"

	"ejp-backend/pkg/logger"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

var (
	AsynqClient *asynq.Client
	Ctx         = context.Background()
)

func ConnectRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	redisOpt, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.Error("Failed to parse REDIS_URL", "error", err)
		os.Exit(1)
	}

	asynqOpt := asynq.RedisClientOpt{
		Addr:     redisOpt.Addr,
		Password: redisOpt.Password,
		DB:       redisOpt.DB,
	}

	AsynqClient = asynq.NewClient(asynqOpt)

	Redis = redis.NewClient(redisOpt)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := Redis.Ping(ctx).Result(); err != nil {
		logger.Error("Failed to connect to Redis — job queue unavailable", "error", err)
		os.Exit(1)
	} else {
		logger.Info("Successfully connected to Redis Queue (Asynq) and Data Cache (Raw)")
	}
}
