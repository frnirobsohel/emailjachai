package config

import (
	"os"
	"strings"

	"ejp-worker/pkg/logger"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

// AsynqPoolCeiling is the fixed Asynq worker pool size.
// Effective parallel verify work is controlled by Job Control (worker_concurrency) via heartbeat.
const AsynqPoolCeiling = 100

type WorkerConfig struct {
	RedisURL         string
	APIBaseURL       string
	WorkerAPIKey     string
	Concurrency      int // Asynq pool size (fixed ceiling; not from env)
	ChunkSizeLimit   int // From Job Control chunk_size via heartbeat
	WorkerServerName string
}

var Cfg *WorkerConfig

// LoadConfig loads environment variables and validates required settings.
// Tuning (concurrency / chunk size) comes from Admin → Job Control, not .env.
func LoadConfig() {
	_ = godotenv.Load()

	cfg := &WorkerConfig{
		RedisURL:       "redis://localhost:6379/0",
		Concurrency:    AsynqPoolCeiling,
		ChunkSizeLimit: 1000, // Job Control default until first heartbeat
	}

	if val := os.Getenv("REDIS_URL"); val != "" {
		cfg.RedisURL = val
	}

	apiBase := os.Getenv("API_BASE_URL")
	if apiBase == "" {
		legacy := os.Getenv("API_URL")
		if legacy != "" {
			apiBase = strings.Replace(legacy, "/report-task", "", 1)
			logger.Warn("API_URL is deprecated, please set API_BASE_URL instead.", zap.String("derived", apiBase))
		} else {
			logger.Fatal("API_BASE_URL environment variable is required")
		}
	}
	cfg.APIBaseURL = strings.TrimRight(apiBase, "/")
	os.Setenv("API_BASE_URL", cfg.APIBaseURL)

	cfg.WorkerAPIKey = os.Getenv("WORKER_API_KEY")

	// Job Control defaults until heartbeat delivers live values
	SetEffectiveWorkerConcurrency(10)

	cfg.WorkerServerName = strings.TrimSpace(os.Getenv("WORKER_SERVER_NAME"))
	if cfg.WorkerServerName == "" {
		if hn, err := os.Hostname(); err == nil && strings.TrimSpace(hn) != "" {
			cleaned := strings.TrimSpace(hn)
			cleaned = strings.ReplaceAll(cleaned, " ", "-")
			cfg.WorkerServerName = cleaned
		} else {
			cfg.WorkerServerName = "worker-auto"
		}
		logger.Info("WORKER_SERVER_NAME not set, automatically assigned server name", zap.String("server_name", cfg.WorkerServerName))
	}

	Cfg = cfg
}
