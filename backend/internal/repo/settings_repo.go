package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SettingsRepo interface {
	GetByKey(key string) (*model.Setting, error)
	GetByKeys(keys []string) ([]model.Setting, error)
	GetAll() ([]model.Setting, error)
	Update(key string, value string) error
	UpdateMany(updates map[string]string) error
	GetByPrefix(prefix string) ([]model.Setting, error)
	DB() *gorm.DB
}

type settingsRepo struct {
	db *gorm.DB
}

func NewSettingsRepo() SettingsRepo {
	return &settingsRepo{db: config.DB}
}

func (r *settingsRepo) DB() *gorm.DB {
	return r.db
}

func (r *settingsRepo) GetByPrefix(prefix string) ([]model.Setting, error) {
	var settings []model.Setting
	err := r.db.Where("setting_key LIKE ?", prefix+"_%").Find(&settings).Error
	return settings, err
}

func (r *settingsRepo) GetByKey(key string) (*model.Setting, error) {
	var setting model.Setting
	if err := r.db.Where("setting_key = ?", key).First(&setting).Error; err != nil {
		return nil, err
	}
	return &setting, nil
}

func (r *settingsRepo) GetAll() ([]model.Setting, error) {
	var settings []model.Setting
	err := r.db.Find(&settings).Error
	return settings, err
}

func (r *settingsRepo) GetByKeys(keys []string) ([]model.Setting, error) {
	var settings []model.Setting
	err := r.db.Where("setting_key IN ?", keys).Find(&settings).Error
	return settings, err
}

func (r *settingsRepo) upsert(db *gorm.DB, key string, value string) error {
	// Unscoped + clear deleted_at so soft-deleted rows don't block unique upsert
	// while remaining invisible to normal GetByKeys queries.
	return db.Unscoped().Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "setting_key"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"setting_value": value,
			"deleted_at":    nil,
			"updated_at":    time.Now(),
		}),
	}).Create(&model.Setting{SettingKey: key, SettingValue: value}).Error
}

func (r *settingsRepo) Update(key string, value string) error {
	return r.upsert(r.db, key, value)
}

func (r *settingsRepo) UpdateMany(updates map[string]string) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		for key, value := range updates {
			if err := r.upsert(tx, key, value); err != nil {
				return err
			}
		}
		return nil
	})
}
