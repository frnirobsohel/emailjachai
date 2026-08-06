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
	templates, err := s.systemRepo.GetTemplates()
	if err != nil {
		return nil, err
	}

	existing := make(map[string]model.EmailTemplate, len(templates))
	for _, t := range templates {
		existing[t.TemplateName] = t
	}

	// Seed missing built-in templates so SMTP credential saves never leave the UI empty.
	// Also upgrade register/forgot bodies that still use magic-link placeholders (OTP migration).
	for key, def := range defaultEmailTemplates {
		cur, ok := existing[key]
		if !ok {
			_ = s.systemRepo.SaveTemplate(&model.EmailTemplate{
				TemplateName: key,
				Subject:      def.Subject,
				Body:         def.Body,
				IsActive:     true,
			})
			continue
		}
		if needsOTPTemplateUpgrade(key, cur.Body) {
			_ = s.systemRepo.SaveTemplate(&model.EmailTemplate{
				TemplateName: key,
				Subject:      def.Subject,
				Body:         def.Body,
				IsActive:     cur.IsActive,
			})
		}
	}

	return s.systemRepo.GetTemplates()
}

// needsOTPTemplateUpgrade detects legacy magic-link register/forgot templates after OTP migration.
func needsOTPTemplateUpgrade(key, body string) bool {
	switch key {
	case "register":
		return strings.Contains(body, "{{verification_link}}") && !strings.Contains(body, "{{verification_code}}")
	case "forgot":
		return strings.Contains(body, "{{reset_link}}") && !strings.Contains(body, "{{reset_code}}")
	default:
		return false
	}
}

var defaultEmailTemplates = map[string]struct{ Subject, Body string }{
	"register": {
		Subject: "Welcome to Email Verification SaaS",
		Body:    "Hi {{name}},\n\nThanks for registering. Your verification code is: {{verification_code}}\n\nThis code expires in 15 minutes.\n\nRegards,\nTeam",
	},
	"forgot": {
		Subject: "Password reset instructions",
		Body:    "Hi {{name}},\n\nYour password reset code is: {{reset_code}}\n\nThis code expires in 15 minutes.\n\nRegards,\nTeam",
	},
	"buy_credits": {
		Subject: "Credit purchase confirmation",
		Body:    "Hi {{name}},\n\nWe received your purchase of {{credits}} credits. Order: {{order_id}}\n\nThanks!",
	},
	"job_completed": {
		Subject: "Your verification job is complete",
		Body:    "Hi {{name}},\n\nJob {{job_id}} has completed. Download results here: {{download_link}}\n\nRegards,\nTeam",
	},
	"transaction": {
		Subject: "Transaction notification",
		Body:    "Hi {{name}},\n\nYour transaction {{txn_id}} has been processed. Amount: {{amount}}\n\nRegards,\nTeam",
	},
	"credit_assigned": {
		Subject: "Credits Assigned",
		Body:    "Hi {{name}},\n\nAdmin has assigned {{credits}} credits to your account.\n\nRegards,\nTeam",
	},
	"account_banned": {
		Subject: "Account Suspended",
		Body:    "Hi {{name}},\n\nYour account has been suspended by the administrator.\n\nRegards,\nTeam",
	},
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
