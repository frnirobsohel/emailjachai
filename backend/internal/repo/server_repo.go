package repo

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WorkerTaskSummary struct {
	WorkerServer string
	JobID        string
	TaskCount    int
}

type ServerRepo interface {
	Create(server *model.WorkerServer) error
	List() ([]model.WorkerServer, error)
	GetByID(id uint) (*model.WorkerServer, error)
	GetByName(name string) (*model.WorkerServer, error)
	Update(server *model.WorkerServer) error
	UpdateFields(id uint, updates map[string]interface{}) error
	Delete(id uint) error
	GetActiveTasksCountByWorker() ([]WorkerTaskSummary, error)
	CountOnlineEnabled() (int64, error)
	GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error)
	RotateWorkerKey() (newKey, maskedKey string, err error)
	CheckAdminPassword(adminID uint, password string) (bool, error)
}

type serverRepo struct {
	db *gorm.DB
}

func NewServerRepo() ServerRepo {
	return &serverRepo{db: config.DB}
}

func (r *serverRepo) Create(server *model.WorkerServer) error {
	return r.db.Create(server).Error
}

func (r *serverRepo) List() ([]model.WorkerServer, error) {
	var servers []model.WorkerServer
	err := r.db.Order("id DESC").Find(&servers).Error
	return servers, err
}

func (r *serverRepo) CountOnlineEnabled() (int64, error) {
	// Match admin server list: "active" = enabled AND last_ping within 130s.
	// DB status='online' can stay stale after a worker dies, so do not trust it alone.
	var count int64
	cutoff := time.Now().UTC().Add(-130 * time.Second)
	err := r.db.Model(&model.WorkerServer{}).
		Where("enabled = ? AND last_ping IS NOT NULL AND last_ping >= ?", true, cutoff).
		Count(&count).Error
	return count, err
}

func (r *serverRepo) GetByID(id uint) (*model.WorkerServer, error) {
	var server model.WorkerServer
	if err := r.db.First(&server, id).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *serverRepo) GetByName(name string) (*model.WorkerServer, error) {
	var server model.WorkerServer
	if err := r.db.Where("server_name = ?", name).First(&server).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *serverRepo) Update(server *model.WorkerServer) error {
	return r.db.Save(server).Error
}

func (r *serverRepo) UpdateFields(id uint, updates map[string]interface{}) error {
	return r.db.Model(&model.WorkerServer{}).Where("id = ?", id).Updates(updates).Error
}

func (r *serverRepo) Delete(id uint) error {
	return r.db.Delete(&model.WorkerServer{}, id).Error
}

func (r *serverRepo) GetActiveTasksCountByWorker() ([]WorkerTaskSummary, error) {
	var summaries []WorkerTaskSummary
	err := r.db.Raw(`
		SELECT worker_server, job_id, COUNT(*) AS task_count
		FROM job_tasks
		WHERE status = 'processing'
		  AND worker_server IS NOT NULL
		  AND worker_server <> ''
		GROUP BY worker_server, job_id
		ORDER BY MAX(updated_at) DESC
	`).Scan(&summaries).Error
	return summaries, err
}

func (r *serverRepo) GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error) {
	err = r.db.Transaction(func(tx *gorm.DB) error {
		var encrypted model.Setting
		if err := tx.Where("setting_key = ?", "worker_api_key_encrypted").First(&encrypted).Error; err == nil {
			plain, decErr := helper.DecryptSecret(encrypted.SettingValue)
			if decErr == nil && plain != "" {
				plainKey = plain
				maskedKey = r.maskKey(plain)
				return nil
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// Provision a new key
		plainKey = "wrk_live_" + helper.GenerateRandomHex(24)
		maskedKey = r.maskKey(plainKey)
		enc, err := helper.EncryptSecret(plainKey)
		if err != nil {
			return err
		}

		if err := r.upsertSetting(tx, "worker_api_key_encrypted", enc); err != nil {
			return err
		}
		if err := r.upsertSetting(tx, "worker_api_key_hash", r.workerKeyHash(plainKey)); err != nil {
			return err
		}
		return nil
	})
	return plainKey, maskedKey, err
}

func (r *serverRepo) RotateWorkerKey() (newKey, maskedKey string, err error) {
	err = r.db.Transaction(func(tx *gorm.DB) error {
		newKey = "wrk_live_" + helper.GenerateRandomHex(24)
		maskedKey = r.maskKey(newKey)

		enc, err := helper.EncryptSecret(newKey)
		if err != nil {
			return err
		}

		if err := r.upsertSetting(tx, "worker_api_key_encrypted", enc); err != nil {
			return err
		}
		if err := r.upsertSetting(tx, "worker_api_key_hash", r.workerKeyHash(newKey)); err != nil {
			return err
		}
		return nil
	})
	return newKey, maskedKey, err
}

func (r *serverRepo) CheckAdminPassword(adminID uint, password string) (bool, error) {
	var admin model.User
	if err := r.db.First(&admin, adminID).Error; err != nil {
		return false, err
	}
	return helper.CheckPasswordHash(strings.TrimSpace(password), admin.Password), nil
}

// Helpers
func (r *serverRepo) maskKey(workerKey string) string {
	if len(workerKey) <= 12 {
		return strings.Repeat("*", len(workerKey))
	}
	return workerKey[:8] + "..." + workerKey[len(workerKey)-4:]
}

func (r *serverRepo) workerKeyHash(workerKey string) string {
	sum := sha256.Sum256([]byte("worker-key|" + workerKey))
	return hex.EncodeToString(sum[:])
}

func (r *serverRepo) upsertSetting(tx *gorm.DB, key, value string) error {
	rec := model.Setting{SettingKey: key, SettingValue: value}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "setting_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"setting_value", "updated_at"}),
	}).Create(&rec).Error
}
