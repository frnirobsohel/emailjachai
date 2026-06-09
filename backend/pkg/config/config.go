package config

import (
	"os"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/pkg/logger"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"github.com/redis/go-redis/v9"
)

var DB *gorm.DB
var Redis *redis.Client

func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		logger.Warn("Error loading .env file, using system environment variables")
	}
}

func ConnectDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Error("DATABASE_URL is not set in the environment")
		os.Exit(1)
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		logger.Error("Failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}

	// Auto-migrate: ONLY in development. Production uses explicit SQL migrations.
	if os.Getenv("GO_ENV") != "production" {
		// Legacy Parity: Ensure job_id is VARCHAR, not BIGINT (Fixes 22P02 error)
		logger.Info("Aligning database schema for JobID (VARCHAR conversion)...")
		if err := db.Exec("ALTER TABLE jobs ALTER COLUMN job_id TYPE VARCHAR(50) USING job_id::text").Error; err != nil {
			logger.Warn("JobID migration raw SQL failed (it might already be VARCHAR)", "error", err)
		}

		logger.Info("Running Database Migrations (dev mode)...")
		err = db.AutoMigrate(
			&model.User{},
			&model.APIKey{},
			&model.Job{},
			&model.JobResult{},
			&model.Transaction{},
			&model.Package{},
			&model.Domain{},
			&model.Setting{},
			&model.SmtpConfig{},
			&model.EmailTemplate{},
			&model.DeletedJobStats{},
			&model.DeletedJobDailyStats{},
			&model.JobTask{},
			&model.ActivityLog{},
			&model.SecurityLog{},
			&model.WorkerServer{},
			&model.EmailCache{},
		)
		if err != nil {
			logger.Error("Failed to run migrations", "error", err)
			os.Exit(1)
		}
	} else {
		logger.Info("Production mode: Skipping AutoMigrate. Use explicit SQL migrations.")
	}

	DB = db

	// Connection Pool Settings (Enterprise standard)
	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
	}

	logger.Info("Successfully connected to PostgreSQL Database!")
}




