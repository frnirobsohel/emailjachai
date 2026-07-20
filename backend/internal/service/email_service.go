package service

import (
	"crypto/tls"
	"fmt"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"gopkg.in/gomail.v2"
)

type EmailService interface {
	SendTemplateEmail(to string, templateKey string, placeholders map[string]string) error
}

type emailService struct {
	systemRepo repo.SystemRepo
}

func NewEmailService(systemRepo repo.SystemRepo) EmailService {
	return &emailService{systemRepo: systemRepo}
}

func (s *emailService) SendTemplateEmail(to string, templateKey string, placeholders map[string]string) error {
	smtpConfig, err := s.systemRepo.GetSmtpSettings()
	if err != nil {
		logger.Warn("Failed to load SMTP config, skipping email", "error", err)
		return nil
	}

	if !smtpConfig.IsActive {
		logger.Info("SMTP is disabled globally, skipping email")
		return nil
	}

	if strings.TrimSpace(smtpConfig.Host) == "" || strings.TrimSpace(smtpConfig.Username) == "" {
		logger.Warn("SMTP credentials are mathematically incomplete, skipping email")
		return nil
	}

	emailTpl, err := s.systemRepo.GetTemplate(templateKey)
	var subject, body string

	if err != nil {
		defaults := map[string]struct{ Subject, Body string }{
			"register": {
				Subject: "Welcome to Email Verification SaaS",
				Body:    "Hi {{name}},\n\nThanks for registering. Verify your email by clicking this link: {{verification_link}}\n\nRegards,\nTeam",
			},
			"forgot": {
				Subject: "Password reset instructions",
				Body:    "Hi {{name}},\n\nReset your password using this link: {{reset_link}}\n\nRegards,\nTeam",
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

		if d, exists := defaults[templateKey]; exists {
			subject = d.Subject
			body = d.Body
			logger.Info("Template not found in database, using default template", "template", templateKey)
		} else {
			logger.Warn("Failed to load email template and no default exists", "template", templateKey, "error", err)
			return nil
		}
	} else {
		if !emailTpl.IsActive {
			logger.Info("Email template is disabled", "template", templateKey)
			return nil
		}
		subject = emailTpl.Subject
		body = emailTpl.Body
	}

	for k, v := range placeholders {
		placeholder := fmt.Sprintf("{{%s}}", k)
		subject = strings.ReplaceAll(subject, placeholder, v)
		body = strings.ReplaceAll(body, placeholder, v)
	}

	// HTML conversion: simple replace \n with <br> for plain text to basic HTML
	bodyHtml := strings.ReplaceAll(body, "\n", "<br>")

	// Decrypt password
	password, err := helper.DecryptSecret(smtpConfig.Password)
	if err != nil {
		logger.Error("Failed to decrypt SMTP password", "error", err)
		return err
	}

	m := gomail.NewMessage()
	
	// Fetch brand name (site_title) from settings
	var appNameSetting []model.Setting
	appName := "System"
	if err := config.DB.Where("setting_key = ?", "site_title").Find(&appNameSetting).Error; err == nil && len(appNameSetting) > 0 {
		appName = appNameSetting[0].SettingValue
	}

	m.SetHeader("From", m.FormatAddress(smtpConfig.Username, appName))
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", bodyHtml)

	port := smtpConfig.Port
	if port <= 0 {
		port = 587
	}

	d := gomail.NewDialer(smtpConfig.Host, port, smtpConfig.Username, password)
	if strings.ToLower(smtpConfig.Encryption) == "ssl" {
		d.SSL = true
	}
	d.TLSConfig = &tls.Config{
		ServerName:         smtpConfig.Host,
		InsecureSkipVerify: false,
	}

	if err := d.DialAndSend(m); err != nil {
		logger.Error("Failed to send email", "to", to, "error", err)
		return err
	}

	logger.Info("Email sent successfully", "to", to, "template", templateKey)
	return nil
}
