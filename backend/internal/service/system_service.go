package service

import (
	"errors"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

var AllowedEmailTemplateKeys = map[string]bool{
	"register":        true,
	"forgot":          true,
	"buy_credits":     true,
	"job_completed":   true,
	"transaction":     true,
	"credit_assigned": true,
	"account_banned":  true,
}

var (
	ErrTemplateNameRequired = errors.New("template name is required")
	ErrTemplateNameInvalid  = errors.New("template name is not allowed")
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

type systemService struct {
	systemRepo repo.SystemRepo
}

func NewSystemService(systemRepo repo.SystemRepo) SystemService {
	return &systemService{systemRepo: systemRepo}
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
	return s.systemRepo.GetSmtpSettings()
}

func (s *systemService) SaveSmtpSettings(inputCfg *model.SmtpConfig, passwordInput string, shouldPreservePassword bool) error {
	cfg, err := s.systemRepo.GetSmtpSettings()
	if err != nil {
		return err
	}

	finalPassword := cfg.Password
	if !shouldPreservePassword {
		enc, encErr := helper.EncryptSmtpSecret(passwordInput)
		if encErr != nil {
			return errors.New("server security misconfiguration")
		}
		finalPassword = enc
	}

	inputCfg.Password = finalPassword
	return s.systemRepo.UpsertSmtpSettings(inputCfg)
}

func (s *systemService) GetTemplates() ([]model.EmailTemplate, error) {
	return s.systemRepo.GetTemplates()
}

func (s *systemService) SaveTemplate(template *model.EmailTemplate) error {
	key := strings.TrimSpace(template.TemplateName)
	if key == "" {
		return ErrTemplateNameRequired
	}
	if !AllowedEmailTemplateKeys[key] {
		return ErrTemplateNameInvalid
	}
	template.TemplateName = key
	template.Subject = strings.TrimSpace(template.Subject)
	template.Body = helper.SanitizeEmailTemplateHTML(template.Body)
	if template.Subject == "" || template.Body == "" {
		return errors.New("subject and body are required")
	}
	return s.systemRepo.SaveTemplate(template)
}
