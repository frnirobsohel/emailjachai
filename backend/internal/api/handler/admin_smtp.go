package handler

import (
	"crypto/tls"
	"net/http"
	"strconv"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gopkg.in/gomail.v2"
)

// GetSmtpSettings returns SMTP config in the legacy UI shape.
func (h *AdminHandler) GetSmtpSettings(c *gin.Context) {
	cfg, err := h.systemService.GetSmtpSettings()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch SMTP settings", err.Error())
		return
	}

	// Defaults
	host := "smtp.example.com"
	port := "587"
	encryption := "tls"
	username := ""
	dailyLimit := "5000"
	hasPassword := false
	isActive := true

	if cfg.ID > 0 {
		if strings.TrimSpace(cfg.Host) != "" {
			host = cfg.Host
		}
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

		if strings.TrimSpace(cfg.Password) != "" {
			plain, decErr := helper.DecryptSecret(cfg.Password)
			if decErr != nil {
				helper.SendError(c, http.StatusInternalServerError, "Server security misconfiguration.", "")
				return
			}
			hasPassword = strings.TrimSpace(plain) != ""
		}
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

// SaveSmtpSettings updates or creates SMTP config (legacy behaviour: preserve password when blank or ********).
func (h *AdminHandler) SaveSmtpSettings(c *gin.Context) {
	adminID, _ := c.Get("userID")
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
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	host := strings.TrimSpace(input.Host)
	port, _ := strconv.Atoi(strings.TrimSpace(input.Port))
	if port <= 0 {
		port = 587
	}
	username := strings.TrimSpace(input.Username)
	encryption := strings.TrimSpace(input.Encryption)
	if encryption == "" {
		encryption = "tls"
	}
	dailyLimit, _ := strconv.Atoi(strings.TrimSpace(input.DailyLimit))
	if dailyLimit <= 0 {
		dailyLimit = 5000
	}

	shouldPreservePassword := strings.TrimSpace(input.Password) == "" || strings.TrimSpace(input.Password) == "********"

	// Backend Input Validation
	if input.IsActive {
		if host == "" || username == "" {
			helper.SendError(c, http.StatusBadRequest, "Host and Username are required to activate SMTP", "")
			return
		}
		if !shouldPreservePassword && strings.TrimSpace(input.Password) == "" {
			helper.SendError(c, http.StatusBadRequest, "Password is required to activate SMTP", "")
			return
		}
		if shouldPreservePassword {
			cfg, err := h.systemService.GetSmtpSettings()
			if err != nil || cfg.Password == "" {
				helper.SendError(c, http.StatusBadRequest, "Password is required to activate SMTP", "")
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
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", "SMTP settings updated")
	helper.SendSuccess(c, "SMTP settings saved", nil)
}

// GetTemplates fetches all email templates
func (h *AdminHandler) GetTemplates(c *gin.Context) {
	templates, err := h.systemService.GetTemplates()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch templates", "")
		return
	}

	helper.SendSuccess(c, "Templates retrieved", templates)
}

// SaveTemplate updates or creates an email template
func (h *AdminHandler) SaveTemplate(c *gin.Context) {
	var input struct {
		TemplateName string `json:"template_name"`
		TemplateKey  string `json:"template_key"`
		Subject      string `json:"subject"`
		Body         string `json:"body"`
		IsActive     bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	key := strings.TrimSpace(input.TemplateName)
	if key == "" {
		key = strings.TrimSpace(input.TemplateKey)
	}
	if key == "" {
		helper.SendError(c, http.StatusBadRequest, "Template name is required", "")
		return
	}

	template := &model.EmailTemplate{
		TemplateName: key,
		Subject:      input.Subject,
		Body:         input.Body,
		IsActive:     input.IsActive,
	}

	if err := h.systemService.SaveTemplate(template); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to save template", err.Error())
		return
	}

	helper.SendSuccess(c, "Template saved", nil)
}

// TestSmtpConnection attempts to dial the SMTP server with the provided credentials
func (h *AdminHandler) TestSmtpConnection(c *gin.Context) {
	var input struct {
		Host       string `json:"host"`
		Port       string `json:"port"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		Encryption string `json:"encryption"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	host := strings.TrimSpace(input.Host)
	port, _ := strconv.Atoi(strings.TrimSpace(input.Port))
	if port <= 0 {
		port = 587
	}
	username := strings.TrimSpace(input.Username)
	password := input.Password

	if strings.TrimSpace(password) == "" || strings.TrimSpace(password) == "********" {
		cfg, err := h.systemService.GetSmtpSettings()
		if err == nil && cfg.Password != "" {
			plain, decErr := helper.DecryptSecret(cfg.Password)
			if decErr == nil {
				password = plain
			}
		}
	}

	if host == "" || username == "" || password == "" {
		helper.SendError(c, http.StatusBadRequest, "Missing required SMTP credentials for testing", "")
		return
	}

	d := gomail.NewDialer(host, port, username, password)
	if strings.ToLower(input.Encryption) == "ssl" {
		d.SSL = true
	}
	d.TLSConfig = &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: false,
	}

	closer, err := d.Dial()
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Connection failed: "+err.Error(), "")
		return
	}
	closer.Close()

	helper.SendSuccess(c, "Connection successful", nil)
}
