package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SettingsRepo interface {
	GetByKey(key string) (*model.Setting, error)
	GetAll() ([]model.Setting, error)
	Update(key string, value string) error
}

type settingsRepo struct {
	db *gorm.DB
}

func NewSettingsRepo() SettingsRepo {
	return &settingsRepo{db: config.DB}
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

func (r *settingsRepo) Update(key string, value string) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "setting_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"setting_value"}),
	}).Create(&model.Setting{SettingKey: key, SettingValue: value}).Error
}
