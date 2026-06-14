package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemRepo interface {
	GetSmtpSettings() (*model.SmtpConfig, error)
	CreateSmtpSettings(cfg *model.SmtpConfig) error
	UpdateSmtpSettings(cfg *model.SmtpConfig) error
	GetTemplates() ([]model.EmailTemplate, error)
	GetTemplate(templateKey string) (*model.EmailTemplate, error)
	SaveTemplate(template *model.EmailTemplate) error
}

type systemRepo struct {
	db *gorm.DB
}

func NewSystemRepo() SystemRepo {
	return &systemRepo{db: config.DB}
}

func (r *systemRepo) GetSmtpSettings() (*model.SmtpConfig, error) {
	var cfg model.SmtpConfig
	err := r.db.First(&cfg).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return &model.SmtpConfig{}, nil
		}
		return nil, err
	}
	return &cfg, nil
}

func (r *systemRepo) CreateSmtpSettings(cfg *model.SmtpConfig) error {
	return r.db.Create(cfg).Error
}

func (r *systemRepo) UpdateSmtpSettings(cfg *model.SmtpConfig) error {
	return r.db.Save(cfg).Error
}

func (r *systemRepo) GetTemplates() ([]model.EmailTemplate, error) {
	var templates []model.EmailTemplate
	if err := r.db.Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

func (r *systemRepo) GetTemplate(templateKey string) (*model.EmailTemplate, error) {
	var template model.EmailTemplate
	if err := r.db.Where("template_name = ?", templateKey).First(&template).Error; err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *systemRepo) SaveTemplate(template *model.EmailTemplate) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "template_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"subject", "body", "is_active", "updated_at"}),
	}).Create(template).Error
}
