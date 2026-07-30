package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/security"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

func mapSettingsError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrSettingsUnknownKey):
		helper.SendError(c, http.StatusBadRequest, "One or more setting keys are not allowed.", "ERR_SETTINGS_KEY")
	case errors.Is(err, service.ErrSettingsInvalidURL):
		helper.SendError(c, http.StatusBadRequest, "Invalid URL. Use a full http(s) URL.", "ERR_INVALID_URL")
	case errors.Is(err, service.ErrSettingsInvalidEmail):
		helper.SendError(c, http.StatusBadRequest, "Invalid email address format.", "ERR_INVALID_EMAIL")
	case errors.Is(err, service.ErrSettingsInvalidColor):
		helper.SendError(c, http.StatusBadRequest, "Invalid hex color format.", "ERR_INVALID_COLOR")
	case errors.Is(err, service.ErrSettingsInvalidNav):
		helper.SendError(c, http.StatusBadRequest, "Navigation style must be dark or light.", "ERR_INVALID_NAV")
	case errors.Is(err, service.ErrSettingsInvalidLength):
		helper.SendError(c, http.StatusBadRequest, "One or more values exceed the maximum length.", "ERR_SETTINGS_LENGTH")
	case errors.Is(err, service.ErrSettingsTitleRequired):
		helper.SendError(c, http.StatusBadRequest, "Site title is required.", "ERR_TITLE_REQUIRED")
	default:
		helper.SendError(c, http.StatusInternalServerError, "Failed to update settings. Please try again.", "ERR_SETTINGS_UPDATE")
	}
}

func parseSettingsBody(c *gin.Context) (map[string]string, error) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		return nil, err
	}

	settingsMap := make(map[string]string)
	if s, ok := body["settings"].(map[string]interface{}); ok {
		for k, v := range s {
			settingsMap[k] = strings.TrimSpace(fmt.Sprintf("%v", v))
			if settingsMap[k] == "<nil>" {
				settingsMap[k] = ""
			}
		}
	} else {
		for k, v := range body {
			if k == "action" || k == "id" {
				continue
			}
			settingsMap[k] = strings.TrimSpace(fmt.Sprintf("%v", v))
			if settingsMap[k] == "<nil>" {
				settingsMap[k] = ""
			}
		}
	}
	return settingsMap, nil
}

// GetSettings fetches all settings with secrets masked.
func (h *AdminHandler) GetSettings(c *gin.Context) {
	settings, err := h.settingsService.GetAllSettings()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch settings", "ERR_SETTINGS_FETCH")
		return
	}
	helper.SendSuccess(c, "Settings retrieved", settings)
}

// GetBrandSettings returns only brand-related settings as a key/value map.
func (h *AdminHandler) GetBrandSettings(c *gin.Context) {
	settings, err := h.settingsService.GetBrandSettings()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch brand settings", "ERR_SETTINGS_FETCH")
		return
	}
	helper.SendSuccess(c, "Brand settings retrieved", settings)
}

// UpdateBrandSettings updates only brand allowlisted keys.
func (h *AdminHandler) UpdateBrandSettings(c *gin.Context) {
	adminID, _ := c.Get("userID")

	settingsMap, err := parseSettingsBody(c)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", "ERR_INVALID_REQUEST")
		return
	}
	if len(settingsMap) == 0 {
		helper.SendError(c, http.StatusBadRequest, "No settings provided", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.settingsService.UpdateBrandSettings(settingsMap, adminID.(uint)); err != nil {
		mapSettingsError(c, err)
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", "Brand settings updated")
	config.ClearPublicSettingsCache()
	helper.SendSuccess(c, "Brand settings updated successfully", nil)
}

// UpdateSettings updates or creates multiple settings at once (global writable allowlist).
func (h *AdminHandler) UpdateSettings(c *gin.Context) {
	adminID, _ := c.Get("userID")

	settingsMap, err := parseSettingsBody(c)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload", "ERR_INVALID_REQUEST")
		return
	}
	if len(settingsMap) == 0 {
		helper.SendError(c, http.StatusBadRequest, "No settings provided", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.settingsService.UpdateSettings(settingsMap, adminID.(uint)); err != nil {
		mapSettingsError(c, err)
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", "System settings updated")
	config.ClearPublicSettingsCache()
	helper.SendSuccess(c, "Settings updated successfully", nil)
}

func (h *AdminHandler) GetPublicSettings(c *gin.Context) {
	if cached, ok := config.GetCachedPublicSettings(); ok {
		out := make(map[string]string, len(cached)+2)
		for k, v := range cached {
			out[k] = v
		}
		if siteKey := security.TurnstileSiteKey(); siteKey != "" {
			out["turnstile_site_key"] = siteKey
		}
		out["turnstile_required"] = boolSetting(security.TurnstileConfigured())
		helper.SendSuccess(c, "Public settings retrieved (cached)", out)
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
		"maintenance_mode",
		"maintenance_message",
	}

	settings, err := h.settingsService.GetSettingsByKeys(publicKeys)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to load public settings", "ERR_SETTINGS_FETCH")
		return
	}

	results := make(map[string]string)
	for _, s := range settings {
		val := s.SettingValue
		if strings.HasSuffix(s.SettingKey, "_enabled") || s.SettingKey == "maintenance_mode" {
			if val == "true" || val == "1" || val == "active" {
				val = "1"
			} else {
				val = "0"
			}
		}
		results[s.SettingKey] = val
	}

	if _, ok := results["site_title"]; !ok || strings.TrimSpace(results["site_title"]) == "" {
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

	out := make(map[string]string, len(results)+2)
	for k, v := range results {
		out[k] = v
	}
	if siteKey := security.TurnstileSiteKey(); siteKey != "" {
		out["turnstile_site_key"] = siteKey
	}
	out["turnstile_required"] = boolSetting(security.TurnstileConfigured())
	helper.SendSuccess(c, "Public settings retrieved", out)
}

func boolSetting(v bool) string {
	if v {
		return "1"
	}
	return "0"
}
