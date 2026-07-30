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

func (r *settingsRepo) Update(key string, value string) error {
	// Unscoped + clear deleted_at so soft-deleted rows don't block unique upsert
	// while remaining invisible to normal GetByKeys queries.
	return r.db.Unscoped().Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "setting_key"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"setting_value": value,
			"deleted_at":    nil,
			"updated_at":    time.Now(),
		}),
	}).Create(&model.Setting{SettingKey: key, SettingValue: value}).Error
}
