package service

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"errors"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SystemService interface {
	GetStatus() (interface{}, error)
	ListBackups() (interface{}, error)
	CreateBackup() error
	GetSmtpSettings() (*model.SmtpConfig, error)
	SaveSmtpSettings(cfg *model.SmtpConfig, passwordInput string, shouldPreservePassword bool) error
	GetTemplates() ([]model.EmailTemplate, error)
	SaveTemplate(template *model.EmailTemplate) error
}

type systemService struct{}

func NewSystemService() SystemService {
	return &systemService{}
}

func (s *systemService) GetStatus() (interface{}, error) {
	return map[string]string{"status": "running"}, nil
}

func (s *systemService) ListBackups() (interface{}, error) {
	return []string{}, nil
}

func (s *systemService) CreateBackup() error {
	return nil
}

func (s *systemService) GetSmtpSettings() (*model.SmtpConfig, error) {
	var cfg model.SmtpConfig
	err := config.DB.First(&cfg).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return &model.SmtpConfig{}, nil
		}
		return nil, err
	}
	return &cfg, nil
}

func (s *systemService) SaveSmtpSettings(inputCfg *model.SmtpConfig, passwordInput string, shouldPreservePassword bool) error {
	var cfg model.SmtpConfig
	err := config.DB.First(&cfg).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	finalPassword := cfg.Password
	if !shouldPreservePassword {
		enc, encErr := helper.EncryptSecret(passwordInput)
		if encErr != nil {
			return errors.New("server security misconfiguration")
		}
		finalPassword = enc
	}

	inputCfg.Password = finalPassword

	if err == gorm.ErrRecordNotFound {
		if err := config.DB.Create(inputCfg).Error; err != nil {
			return err
		}
	} else {
		inputCfg.ID = cfg.ID
		if err := config.DB.Save(inputCfg).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *systemService) GetTemplates() ([]model.EmailTemplate, error) {
	var templates []model.EmailTemplate
	if err := config.DB.Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

func (s *systemService) SaveTemplate(template *model.EmailTemplate) error {
	if strings.TrimSpace(template.TemplateName) == "" {
		return errors.New("template name is required")
	}
	return config.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "template_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"subject", "body", "is_active", "updated_at"}),
	}).Create(template).Error
}
