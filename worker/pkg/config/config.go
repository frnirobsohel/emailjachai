package config

import (
	"os"
	"strconv"
	"strings"

	"ejp-worker/pkg/logger"

	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

type WorkerConfig struct {
	RedisURL         string
	APIBaseURL       string
	WorkerAPIKey     string
	Concurrency      int
	ChunkSizeLimit   int
	WorkerServerName string
}

var Cfg *WorkerConfig

// LoadConfig loads environment variables and validates required settings.
func LoadConfig() {
	_ = godotenv.Load()

	cfg := &WorkerConfig{
		RedisURL:         "redis://localhost:6379/0",
		Concurrency:      10,
		ChunkSizeLimit:   50,
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
	os.Setenv("API_BASE_URL", cfg.APIBaseURL) // keep compatible with other code using os.Getenv temporarily if needed

	cfg.WorkerAPIKey = os.Getenv("WORKER_API_KEY")

	if raw := strings.TrimSpace(os.Getenv("CONCURRENCY")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			cfg.Concurrency = parsed
		}
	}

	if raw := strings.TrimSpace(os.Getenv("CHUNK_SIZE")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			cfg.ChunkSizeLimit = parsed
		}
	}

	cfg.WorkerServerName = os.Getenv("WORKER_SERVER_NAME")
	if cfg.WorkerServerName == "" {
		if hn, err := os.Hostname(); err == nil {
			cfg.WorkerServerName = hn
		} else {
			cfg.WorkerServerName = "unknown-go-worker"
		}
	}

	Cfg = cfg
}
