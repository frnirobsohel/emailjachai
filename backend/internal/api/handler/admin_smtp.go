package handler

import (
	"crypto/tls"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
	"gopkg.in/gomail.v2"
)

// GetSmtpSettings returns SMTP config in the UI shape (password never returned).
func (h *AdminHandler) GetSmtpSettings(c *gin.Context) {
	cfg, err := h.systemService.GetSmtpSettings()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch SMTP settings", "ERR_SMTP_FETCH")
		return
	}

	host := ""
	port := "587"
	encryption := "tls"
	username := ""
	dailyLimit := "5000"
	hasPassword := false
	isActive := false

	if cfg.ID > 0 {
		host = strings.TrimSpace(cfg.Host)
		if cfg.Port > 0 {
			port = strconv.Itoa(cfg.Port)
		}
		if strings.TrimSpace(cfg.Encryption) != "" {
			encryption = cfg.Encryption
		}
		username = cfg.Username
		if cfg.DailyLimit > 0 {
			dailyLimit = strconv.Itoa(cfg.DailyLimit)
		}
		hasPassword = strings.TrimSpace(cfg.Password) != ""
		isActive = cfg.IsActive
	}

	helper.SendSuccess(c, "SMTP settings retrieved", gin.H{
		"host":         host,
		"port":         port,
		"encryption":   encryption,
		"username":     username,
		"password":     "",
		"has_password": hasPassword,
		"daily_limit":  dailyLimit,
		"is_active":    isActive,
	})
}

// SaveSmtpSettings updates or creates SMTP config (preserve password when blank or ********).
func (h *AdminHandler) SaveSmtpSettings(c *gin.Context) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		Host       string `json:"host"`
		Port       string `json:"port"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		Encryption string `json:"encryption"`
		DailyLimit string `json:"daily_limit"`
		IsActive   bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", "ERR_INVALID_REQUEST")
		return
	}

	host := strings.TrimSpace(input.Host)
	port, _ := strconv.Atoi(strings.TrimSpace(input.Port))
	if port <= 0 {
		port = 587
	}
	if port > 65535 {
		helper.SendError(c, http.StatusBadRequest, "Port must be between 1 and 65535.", "ERR_INVALID_PORT")
		return
	}
	username := strings.TrimSpace(input.Username)
	encryption := strings.ToLower(strings.TrimSpace(input.Encryption))
	if encryption == "" {
		encryption = "tls"
	}

	allowedEncryptions := map[string]bool{"none": true, "ssl": true, "tls": true}
	if !allowedEncryptions[encryption] {
		helper.SendError(c, http.StatusBadRequest, "Invalid encryption mode. Choose none, ssl, or tls.", "ERR_INVALID_ENCRYPTION")
		return
	}

	dailyLimit, _ := strconv.Atoi(strings.TrimSpace(input.DailyLimit))
	if dailyLimit <= 0 {
		dailyLimit = 5000
	}
	if dailyLimit > 1_000_000 {
		helper.SendError(c, http.StatusBadRequest, "Daily limit is too high.", "ERR_INVALID_DAILY_LIMIT")
		return
	}

	shouldPreservePassword := strings.TrimSpace(input.Password) == "" || strings.TrimSpace(input.Password) == "********"

	if host != "" {
		if err := helper.ValidatePublicSMTPHost(host); err != nil {
			helper.SendError(c, http.StatusBadRequest, "SMTP host is not allowed.", "ERR_SMTP_HOST")
			return
		}
	}

	if input.IsActive {
		if host == "" || username == "" {
			helper.SendError(c, http.StatusBadRequest, "Host and Username are required to activate SMTP", "ERR_SMTP_REQUIRED")
			return
		}
		if !shouldPreservePassword && strings.TrimSpace(input.Password) == "" {
			helper.SendError(c, http.StatusBadRequest, "Password is required to activate SMTP", "ERR_SMTP_PASSWORD")
			return
		}
		if shouldPreservePassword {
			cfg, err := h.systemService.GetSmtpSettings()
			if err != nil || strings.TrimSpace(cfg.Password) == "" {
				helper.SendError(c, http.StatusBadRequest, "Password is required to activate SMTP", "ERR_SMTP_PASSWORD")
				return
			}
		}
	}

	cfg := &model.SmtpConfig{
		Host:       host,
		Port:       port,
		Username:   username,
		Encryption: encryption,
		DailyLimit: dailyLimit,
		IsActive:   input.IsActive,
	}

	if err := h.systemService.SaveSmtpSettings(cfg, input.Password, shouldPreservePassword); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to save SMTP settings. Please try again.", "ERR_SMTP_SAVE")
		return
	}

	logAction(adminID, "INFO", "Admin", "SMTP settings updated")
	helper.SendSuccess(c, "SMTP settings saved", nil)
}

// GetTemplates fetches all email templates
func (h *AdminHandler) GetTemplates(c *gin.Context) {
	templates, err := h.systemService.GetTemplates()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch templates", "ERR_TEMPLATE_FETCH")
		return
	}

	helper.SendSuccess(c, "Templates retrieved", templates)
}

// SaveTemplate updates or creates an email template
func (h *AdminHandler) SaveTemplate(c *gin.Context) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		TemplateName string `json:"template_name"`
		TemplateKey  string `json:"template_key"`
		Subject      string `json:"subject"`
		Body         string `json:"body"`
		IsActive     bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", "ERR_INVALID_REQUEST")
		return
	}

	key := strings.TrimSpace(input.TemplateName)
	if key == "" {
		key = strings.TrimSpace(input.TemplateKey)
	}
	if key == "" {
		helper.SendError(c, http.StatusBadRequest, "Template name is required", "ERR_TEMPLATE_NAME")
		return
	}

	template := &model.EmailTemplate{
		TemplateName: key,
		Subject:      input.Subject,
		Body:         input.Body,
		IsActive:     input.IsActive,
	}

	if err := h.systemService.SaveTemplate(template); err != nil {
		switch {
		case errors.Is(err, service.ErrTemplateNameInvalid):
			helper.SendError(c, http.StatusBadRequest, "Template name is not allowed.", "ERR_TEMPLATE_NAME")
		case errors.Is(err, service.ErrTemplateNameRequired):
			helper.SendError(c, http.StatusBadRequest, "Template name is required", "ERR_TEMPLATE_NAME")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Failed to save template. Please try again.", "ERR_TEMPLATE_SAVE")
		}
		return
	}

	logAction(adminID, "INFO", "Admin", "Email template updated: "+key)
	helper.SendSuccess(c, "Template saved", nil)
}

// TestSmtpConnection dials the SMTP server, then persists config with is_active=true on success.
func (h *AdminHandler) TestSmtpConnection(c *gin.Context) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		Host       string `json:"host"`
		Port       string `json:"port"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		Encryption string `json:"encryption"`
		DailyLimit string `json:"daily_limit"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", "ERR_INVALID_REQUEST")
		return
	}

	host := strings.TrimSpace(input.Host)
	port, _ := strconv.Atoi(strings.TrimSpace(input.Port))
	if port <= 0 {
		port = 587
	}
	if port > 65535 {
		helper.SendError(c, http.StatusBadRequest, "Port must be between 1 and 65535.", "ERR_INVALID_PORT")
		return
	}
	username := strings.TrimSpace(input.Username)
	password := input.Password
	encryption := strings.ToLower(strings.TrimSpace(input.Encryption))
	if encryption == "" {
		encryption = "tls"
	}
	if encryption != "none" && encryption != "ssl" && encryption != "tls" {
		helper.SendError(c, http.StatusBadRequest, "Invalid encryption mode.", "ERR_INVALID_ENCRYPTION")
		return
	}

	existing, _ := h.systemService.GetSmtpSettings()
	dailyLimit := existing.DailyLimit
	if dailyLimit <= 0 {
		dailyLimit = 5000
	}
	if v, err := strconv.Atoi(strings.TrimSpace(input.DailyLimit)); err == nil && v > 0 && v <= 1_000_000 {
		dailyLimit = v
	}

	shouldPreservePassword := strings.TrimSpace(password) == "" || strings.TrimSpace(password) == "********"
	if shouldPreservePassword {
		if existing != nil && existing.Password != "" {
			plain, decErr := helper.DecryptSmtpSecret(existing.Password)
			if decErr != nil || strings.TrimSpace(plain) == "" {
				helper.SendError(c, http.StatusBadRequest, "Missing required SMTP credentials for testing", "ERR_SMTP_PASSWORD")
				return
			}
			password = plain
		}
	}

	if host == "" || username == "" || strings.TrimSpace(password) == "" {
		helper.SendError(c, http.StatusBadRequest, "Missing required SMTP credentials for testing", "ERR_SMTP_REQUIRED")
		return
	}

	if err := helper.ValidatePublicSMTPHost(host); err != nil {
		helper.SendError(c, http.StatusBadRequest, "SMTP host is not allowed for testing.", "ERR_SMTP_HOST")
		return
	}

	d := gomail.NewDialer(host, port, username, password)
	if encryption == "ssl" {
		d.SSL = true
	}
	if encryption != "none" {
		d.TLSConfig = &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: false,
			MinVersion:         tls.VersionTLS12,
		}
	}

	closer, err := d.Dial()
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Connection failed. Check host, port, encryption, and credentials.", "ERR_SMTP_TEST")
		return
	}
	_ = closer.Close()

	cfg := &model.SmtpConfig{
		Host:       host,
		Port:       port,
		Username:   username,
		Encryption: encryption,
		DailyLimit: dailyLimit,
		IsActive:   true,
	}
	if err := h.systemService.SaveSmtpSettings(cfg, password, shouldPreservePassword); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Connection worked but failed to activate SMTP.", "ERR_SMTP_SAVE")
		return
	}

	logAction(adminID, "INFO", "Admin", "SMTP connection tested and activated")
	helper.SendSuccess(c, "Connection successful", gin.H{"is_active": true, "has_password": true})
}