package config

import (
	"os"
	"strings"

	"ejp-backend/pkg/logger"
)

func isProductionEnv() bool {
	goEnv := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	env := strings.ToLower(strings.TrimSpace(os.Getenv("ENVIRONMENT")))
	return goEnv == "production" || env == "production"
}

// ValidateProductionConfig fail-fasts on missing public URL / CORS settings
// that would otherwise silently fall back to localhost.
func ValidateProductionConfig() {
	if !isProductionEnv() {
		return
	}

	var missing []string

	if strings.TrimSpace(os.Getenv("CORS_ORIGINS")) == "" {
		missing = append(missing, "CORS_ORIGINS")
	}
	if strings.TrimSpace(os.Getenv("FRONTEND_URL")) == "" {
		missing = append(missing, "FRONTEND_URL")
	}
	if strings.TrimSpace(os.Getenv("JWT_SECRET")) == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if strings.TrimSpace(os.Getenv("WORKER_API_KEY")) == "" {
		missing = append(missing, "WORKER_API_KEY")
	}

	if len(missing) > 0 {
		logger.Error("Production config incomplete — refusing to start",
			"missing", strings.Join(missing, ", "),
		)
		os.Exit(1)
	}

	dsn := strings.ToLower(os.Getenv("DATABASE_URL"))
	if strings.Contains(dsn, "sslmode=disable") {
		logger.Warn("DATABASE_URL uses sslmode=disable — use sslmode=require (or verify-full) in production")
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("API_REPLICAS")), "multi") ||
		strings.EqualFold(strings.TrimSpace(os.Getenv("SHARED_STORAGE")), "required") {
		logger.Info("Multi-replica mode noted — ensure BULK_*_PATH mount is a shared volume")
	} else {
		logger.Info("Bulk storage is local filesystem — use a single API replica, or set SHARED_STORAGE=required and mount shared volumes on BULK_*_PATH")
	}

	logger.Info("Production config validated (CORS_ORIGINS, FRONTEND_URL, JWT_SECRET, WORKER_API_KEY)")
}
