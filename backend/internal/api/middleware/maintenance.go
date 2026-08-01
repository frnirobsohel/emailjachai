package middleware

import (
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

// MaintenanceMiddleware intercepts requests and returns a 503 error if the system is in maintenance mode.
func MaintenanceMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Skip check for admin routes
		path := c.Request.URL.Path
		if strings.Contains(path, "/api/v1/admin") {
			c.Next()
			return
		}

		// 2. Fetch public settings (from Redis cache or DB)
		var settings map[string]string
		cached, ok := config.GetCachedPublicSettings()
		if ok {
			settings = cached
		} else {
			// Cache miss, fetch from DB
			settings = make(map[string]string)
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
				"youtube_url",
				"facebook_url",
				"cryptomus_enabled",
				"stripe_enabled",
				"paypal_enabled",
				"maintenance_mode",
				"maintenance_message",
			}
			var dbSettings []model.Setting
			if err := config.DB.Where("setting_key IN ?", publicKeys).Find(&dbSettings).Error; err == nil {
				for _, s := range dbSettings {
					val := s.SettingValue
					if strings.HasSuffix(s.SettingKey, "_enabled") || s.SettingKey == "maintenance_mode" {
						if val == "true" || val == "1" || val == "active" {
							val = "1"
						} else {
							val = "0"
						}
					}
					settings[s.SettingKey] = val
				}
				// Add defaults if missing
				if _, ok := settings["site_title"]; !ok {
					settings["site_title"] = "EmailJachai Pro"
				}
				config.SetCachedPublicSettings(settings, 5*time.Minute)
			}
		}

		// 3. Check if maintenance mode is active
		if settings["maintenance_mode"] == "1" {
			msg := settings["maintenance_message"]
			if msg == "" {
				msg = "System is undergoing scheduled maintenance. Please try again later."
			}
			helper.SendError(c, http.StatusServiceUnavailable, msg, "ERR_MAINTENANCE_MODE")
			c.Abort()
			return
		}

		c.Next()
	}
}
