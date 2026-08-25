package config

import (
	"errors"
	"log"
	"os"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/pkg/logger"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	gormLogger "gorm.io/gorm/logger"
)

var DB *gorm.DB
var Redis *redis.Client

func LoadConfig() {
	err := godotenv.Load()
	if err != nil && os.Getenv("GO_ENV") != "production" {
		logger.Warn("Error loading .env file, using system environment variables")
	}
}

func ConnectDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Error("DATABASE_URL is not set in the environment")
		os.Exit(1)
	}

	newLogger := gormLogger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		gormLogger.Config{
			SlowThreshold:             500 * time.Millisecond,
			LogLevel:                  gormLogger.Warn,
			IgnoreRecordNotFoundError: true,
			ParameterizedQueries:      true,
			Colorful:                  false,
		},
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: newLogger,
	})
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
			&model.PublicVerifyLog{},
			&model.BlockedClient{},
		)
		if err != nil {
			logger.Error("Failed to run migrations", "error", err)
			os.Exit(1)
		}
	} else {
		// Production skips full AutoMigrate; apply only additive, idempotent ensures
		// so a deploy cannot race ahead of a manual SQL migration and break SELECTs.
		logger.Info("Production mode: Skipping AutoMigrate. Applying additive schema ensures...")
		if err := db.Exec(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10, 2) NOT NULL DEFAULT 0`).Error; err != nil {
			logger.Error("Failed to ensure packages.offer_price column", "error", err)
			os.Exit(1)
		}
	}

	// Leave unused worker_servers.daily_limit in place if present (rolling-deploy safe).
	// Column is omitted from the Go model and fresh schema; DROP would break old API replicas mid-rollout.

	// worker_servers.rate_limit: 0 = unlimited (safe default). One-time normalize of legacy unused default 100.
	if err := db.Exec(`ALTER TABLE worker_servers ALTER COLUMN rate_limit SET DEFAULT 0`).Error; err != nil {
		logger.Error("Failed to ensure worker_servers.rate_limit default", "error", err)
		os.Exit(1)
	}
	var migrated model.Setting
	if err := db.Where("setting_key = ?", "worker_rate_limit_default_v1").First(&migrated).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Error("Failed to check worker_rate_limit_default_v1 migration flag", "error", err)
			os.Exit(1)
		}
		if err := db.Exec(`UPDATE worker_servers SET rate_limit = 0 WHERE rate_limit = 100`).Error; err != nil {
			logger.Error("Failed to normalize worker_servers.rate_limit defaults", "error", err)
			os.Exit(1)
		}
		// Concurrent backend startups: unique setting_key + DO NOTHING (no os.Exit on race).
		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "setting_key"}},
			DoNothing: true,
		}).Create(&model.Setting{
			SettingKey:   "worker_rate_limit_default_v1",
			SettingValue: "1",
		}).Error; err != nil {
			logger.Error("Failed to record worker_rate_limit_default_v1 migration", "error", err)
			os.Exit(1)
		}
	}

	DB = db

	// Connection Pool Settings (Enterprise standard)
	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
		sqlDB.SetConnMaxIdleTime(15 * time.Minute) // Prevent firewall connection drops
	}

	logger.Info("Successfully connected to PostgreSQL Database!")
}




