package handler

import (
	"net/http"
	"strconv"
	"strings"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetSmtpSettings returns SMTP config in the legacy UI shape.
func (h *AdminHandler) GetSmtpSettings(c *gin.Context) {
	var cfg model.SmtpConfig
	err := config.DB.First(&cfg).Error
	if err != nil && err != gorm.ErrRecordNotFound {
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

	if err == nil {
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
			plain, decErr := decryptSecret(cfg.Password)
			if decErr != nil {
				helper.SendError(c, http.StatusInternalServerError, "Server security misconfiguration.", "")
				return
			}
			hasPassword = strings.TrimSpace(plain) != ""
		}
	}

	helper.SendSuccess(c, "SMTP settings retrieved", gin.H{
		"host":         host,
		"port":         port,
		"encryption":   encryption,
		"username":     username,
		"password":     "",
		"has_password": hasPassword,
		"daily_limit":  dailyLimit,
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

	var cfg model.SmtpConfig
	err := config.DB.First(&cfg).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		helper.SendError(c, http.StatusInternalServerError, "Failed to access SMTP settings", err.Error())
		return
	}

	finalPassword := cfg.Password
	if !shouldPreservePassword {
		enc, encErr := encryptSecret(input.Password)
		if encErr != nil {
			helper.SendError(c, http.StatusInternalServerError, "Server security misconfiguration.", "")
			return
		}
		finalPassword = enc
	}

	if err == gorm.ErrRecordNotFound {
		cfg = model.SmtpConfig{
			Host:       host,
			Port:       port,
			Username:   username,
			Password:   finalPassword,
			Encryption: encryption,
			DailyLimit: dailyLimit,
		}
		if err := config.DB.Create(&cfg).Error; err != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to save SMTP settings", err.Error())
			return
		}
	} else {
		updates := map[string]interface{}{
			"host":        host,
			"port":        port,
			"username":    username,
			"password":    finalPassword,
			"encryption":  encryption,
			"daily_limit": dailyLimit,
		}
		if err := config.DB.Model(&cfg).Updates(updates).Error; err != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to save SMTP settings", err.Error())
			return
		}
	}

	logAction(adminID.(uint), "INFO", "Admin", "SMTP settings updated")
	helper.SendSuccess(c, "SMTP settings saved", nil)
}

// GetTemplates fetches all email templates
func (h *AdminHandler) GetTemplates(c *gin.Context) {
	var templates []model.EmailTemplate
	if err := config.DB.Find(&templates).Error; err != nil {
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

	template := model.EmailTemplate{
		TemplateName: key,
		Subject:      input.Subject,
		Body:         input.Body,
	}

	if err := config.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "template_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"subject", "body", "updated_at"}),
	}).Create(&template).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to save template", err.Error())
		return
	}

	helper.SendSuccess(c, "Template saved", nil)
}



