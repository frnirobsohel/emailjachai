package handler

import (
	"net/http"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

// SecurityDashboard returns the overview metrics for the Security Shield
func (h *AdminHandler) SecurityDashboard(c *gin.Context) {
	// 1. Total Verified (24h)
	var totalVerified int64
	yesterday := time.Now().Add(-24 * time.Hour)
	config.DB.Model(&model.PublicVerifyLog{}).Where("created_at > ?", yesterday).Count(&totalVerified)

	// Unique IPs (24h)
	var uniqueIPs int64
	config.DB.Model(&model.PublicVerifyLog{}).Where("created_at > ?", yesterday).Distinct("ip").Count(&uniqueIPs)

	// Fraud Attempts Prevented (Blocked status in logs)
	var fraudPrevented int64
	config.DB.Model(&model.PublicVerifyLog{}).Where("created_at > ? AND status = ?", yesterday, "blocked").Count(&fraudPrevented)

	// Currently Blocked
	var currentlyBlocked int64
	config.DB.Model(&model.BlockedClient{}).Count(&currentlyBlocked)

	// Get Daily Limit Setting
	dailyLimit := "10"
	var limitSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "daily_free_limit").First(&limitSetting).Error; err == nil {
		dailyLimit = limitSetting.SettingValue
	}

	// Get Verifier Toggle Setting
	verifierEnabled := true
	var toggleSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "public_verifier_enabled").First(&toggleSetting).Error; err == nil {
		verifierEnabled = toggleSetting.SettingValue == "true"
	}

	helper.SendSuccess(c, "Security dashboard retrieved", gin.H{
		"total_verified":   totalVerified,
		"unique_ips":       uniqueIPs,
		"fraud_prevented":  fraudPrevented,
		"currently_blocked": currentlyBlocked,
		"daily_limit":      dailyLimit,
		"verifier_enabled": verifierEnabled,
	})
}

// GetSecurityVerifyLogs returns the real-time stream of verifications
func (h *AdminHandler) GetSecurityVerifyLogs(c *gin.Context) {
	var logs []model.PublicVerifyLog
	if err := config.DB.Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch verification logs", err.Error())
		return
	}
	helper.SendSuccess(c, "Verification logs retrieved", logs)
}

// GetSecurityBlocklist returns the list of blocked IPs and Cookies
func (h *AdminHandler) GetSecurityBlocklist(c *gin.Context) {
	var blocks []model.BlockedClient
	if err := config.DB.Order("blocked_at desc").Limit(50).Find(&blocks).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch blocklist", err.Error())
		return
	}
	helper.SendSuccess(c, "Blocklist retrieved", blocks)
}

// SecurityUnblock removes an IP or Cookie from the blocklist
func (h *AdminHandler) SecurityUnblock(c *gin.Context) {
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if err := config.DB.Delete(&model.BlockedClient{}, input.ID).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to unblock", err.Error())
		return
	}
	helper.SendSuccess(c, "Client unblocked successfully", nil)
}

// UpdateSecuritySettings updates limit and toggle
func (h *AdminHandler) UpdateSecuritySettings(c *gin.Context) {
	var input struct {
		DailyLimit      string `json:"daily_limit"`
		VerifierEnabled *bool  `json:"verifier_enabled"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if input.DailyLimit != "" {
		setting := model.Setting{SettingKey: "daily_free_limit", SettingValue: input.DailyLimit}
		config.DB.Where("setting_key = ?", "daily_free_limit").Assign(setting).FirstOrCreate(&setting)
	}

	if input.VerifierEnabled != nil {
		val := "false"
		if *input.VerifierEnabled {
			val = "true"
		}
		setting := model.Setting{SettingKey: "public_verifier_enabled", SettingValue: val}
		config.DB.Where("setting_key = ?", "public_verifier_enabled").Assign(setting).FirstOrCreate(&setting)
		ClearPublicVerifierEnabledCache()
	}

	helper.SendSuccess(c, "Settings updated successfully", nil)
}

// TogglePackagePublic toggles visibility of a package on frontend
func (h *AdminHandler) TogglePackagePublic(c *gin.Context) {
	var input struct {
		PackageID uint `json:"package_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid package payload", "ERR_PACKAGE_PAYLOAD")
		return
	}

	pkg, err := h.packageService.TogglePackagePublic(input.PackageID)
	if err != nil {
		mapPackageError(c, err)
		return
	}

	helper.SendSuccess(c, "Package visibility updated", normalizePackage(*pkg))
}
