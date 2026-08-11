package config

import (
	"log"
	"os"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/pkg/logger"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
	"github.com/redis/go-redis/v9"
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




