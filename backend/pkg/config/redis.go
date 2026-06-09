package config

import (
	"context"
	"os"
	"strings"
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
		redisURL = "localhost:6379"
	}

	// Clean up URL for asynq and redis client
	redisAddr := strings.Replace(redisURL, "redis://", "", 1)
	redisAddr = strings.Split(redisAddr, "/")[0]

	redisOpt := asynq.RedisClientOpt{Addr: redisAddr}
	
	AsynqClient = asynq.NewClient(redisOpt)
	
	Redis = redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := Redis.Ping(ctx).Result(); err != nil {
		logger.Error("Failed to connect to Redis — job queue unavailable", "error", err)
		os.Exit(1)
	} else {
		logger.Info("Successfully connected to Redis Queue (Asynq) and Data Cache (Raw)")
	}
}



