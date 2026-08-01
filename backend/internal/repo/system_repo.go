package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemRepo interface {
	GetSmtpSettings() (*model.SmtpConfig, error)
	UpsertSmtpSettings(cfg *model.SmtpConfig) error
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
	err := r.db.Order("id ASC").First(&cfg).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return &model.SmtpConfig{}, nil
		}
		return nil, err
	}
	return &cfg, nil
}

func (r *systemRepo) UpsertSmtpSettings(cfg *model.SmtpConfig) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existing model.SmtpConfig
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Order("id ASC").First(&existing).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				return tx.Create(cfg).Error
			}
			return err
		}
		cfg.ID = existing.ID
		cfg.CreatedAt = existing.CreatedAt
		cfg.UpdatedAt = time.Now()
		return tx.Save(cfg).Error
	})
}

func (r *systemRepo) CreateSmtpSettings(cfg *model.SmtpConfig) error {
	return r.UpsertSmtpSettings(cfg)
}

func (r *systemRepo) UpdateSmtpSettings(cfg *model.SmtpConfig) error {
	return r.UpsertSmtpSettings(cfg)
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
	now := time.Now()
	template.UpdatedAt = now
	return r.db.Unscoped().Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "template_name"}},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"subject":    template.Subject,
			"body":       template.Body,
			"is_active":  template.IsActive,
			"deleted_at": nil,
			"updated_at": now,
		}),
	}).Create(template).Error
}
