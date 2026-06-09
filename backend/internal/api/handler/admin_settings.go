package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// GetSettings fetches all settings
func (h *AdminHandler) GetSettings(c *gin.Context) {
	var settings []model.Setting
	if err := config.DB.Find(&settings).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch settings", err.Error())
		return
	}

	sensitiveKeys := map[string]bool{
		"stripe_secret_key":        true,
		"stripe_webhook_secret":    true,
		"paypal_secret_key":        true,
		"paypal_webhook_id":        true,
		"cryptomus_payment_key":    true,
		"cryptomus_secret_key":     true,
		"cryptomus_webhook_secret": true,
	}

	for i, s := range settings {
		if sensitiveKeys[s.SettingKey] && s.SettingValue != "" {
			settings[i].SettingValue = "********"
		}
	}

	helper.SendSuccess(c, "Settings retrieved", settings)
}

// UpdateSettings updates or creates multiple settings at once
func (h *AdminHandler) UpdateSettings(c *gin.Context) {
	adminID, _ := c.Get("userID")

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	settingsMap := make(map[string]string)
	if s, ok := body["settings"].(map[string]interface{}); ok {
		for k, v := range s {
			settingsMap[k] = fmt.Sprintf("%v", v)
		}
	} else {
		for k, v := range body {
			if k != "action" && k != "id" {
				settingsMap[k] = fmt.Sprintf("%v", v)
			}
		}
	}

	numericRules := map[string]struct{ min, max, def int }{
		"chunk_size":               {10, 50000, 1000},
		"task_timeout":             {1, 1440, 60},
		"max_emails_per_job":       {10, 1000000, 100000},
		"max_active_jobs_per_user": {0, 10000, 0},
	}

	for k, v := range settingsMap {
		if rule, ok := numericRules[k]; ok {
			num, err := strconv.Atoi(v)
			if err != nil {
				num = rule.def
			}
			if num < rule.min {
				num = rule.min
			}
			if num > rule.max {
				num = rule.max
			}
			settingsMap[k] = strconv.Itoa(num)
		}
	}

	if err := h.settingsService.UpdateSettings(settingsMap, adminID.(uint)); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update settings", err.Error())
		return
	}

	config.ClearPublicSettingsCache()
	helper.SendSuccess(c, "Settings updated successfully", nil)
}

func (h *AdminHandler) GetPublicSettings(c *gin.Context) {
	if cached, ok := config.GetCachedPublicSettings(); ok {
		helper.SendSuccess(c, "Public settings retrieved (cached)", cached)
		return
	}

	publicKeys := []string{
		"site_title",
		"site_tagline",
		"logo_url",
		"favicon_url",
		"primary_color",
		"nav_style",
		"support_email",
		"help_center_url",
		"twitter_url",
		"linkedin_url",
		"github_url",
		"cryptomus_enabled",
		"stripe_enabled",
		"paypal_enabled",
	}

	var settings []model.Setting
	if err := config.DB.Where("setting_key IN ?", publicKeys).Find(&settings).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to load public settings", "")
		return
	}

	results := make(map[string]string)
	for _, s := range settings {
		val := s.SettingValue
		// Parity: Ensure enabled flags are "1" or "0"
		if strings.HasSuffix(s.SettingKey, "_enabled") {
			if val == "true" || val == "1" || val == "active" {
				val = "1"
			} else {
				val = "0"
			}
		}
		results[s.SettingKey] = val
	}

	// Add defaults if missing
	if _, ok := results["site_title"]; !ok {
		results["site_title"] = "EmailJachai Pro"
	}
	if _, ok := results["stripe_enabled"]; !ok {
		results["stripe_enabled"] = "0"
	}
	if _, ok := results["paypal_enabled"]; !ok {
		results["paypal_enabled"] = "0"
	}
	if _, ok := results["cryptomus_enabled"]; !ok {
		results["cryptomus_enabled"] = "0"
	}

	config.SetCachedPublicSettings(results, 5*time.Minute)
	helper.SendSuccess(c, "Public settings retrieved", results)
}



