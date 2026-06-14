package service

import (
	"crypto/tls"
	"fmt"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/repo"
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
	if err != nil {
		logger.Warn("Failed to load email template", "template", templateKey, "error", err)
		return nil
	}

	if !emailTpl.IsActive {
		logger.Info("Email template is disabled", "template", templateKey)
		return nil
	}

	// Build subject and body
	subject := emailTpl.Subject
	body := emailTpl.Body

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
	m.SetHeader("From", smtpConfig.Username)
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
		InsecureSkipVerify: true,
	}
	
	if err := d.DialAndSend(m); err != nil {
		logger.Error("Failed to send email", "to", to, "error", err)
		return err
	}

	logger.Info("Email sent successfully", "to", to, "template", templateKey)
	return nil
}
