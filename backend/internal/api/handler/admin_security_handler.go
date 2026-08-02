package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/security"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

var allowedDailyFreeLimits = map[string]struct{}{
	"5": {}, "10": {}, "15": {}, "20": {},
}

func normalizeUnblockConfirm(confirm string) bool {
	return strings.ToUpper(strings.TrimSpace(confirm)) == "UNBLOCK"
}

// SecurityDashboard returns the overview metrics for the Security Shield
func (h *AdminHandler) SecurityDashboard(c *gin.Context) {
	yesterday := time.Now().UTC().Add(-24 * time.Hour)

	type dashCounts struct {
		TotalVerified  int64 `gorm:"column:total_verified"`
		UniqueIPs      int64 `gorm:"column:unique_ips"`
		FraudPrevented int64 `gorm:"column:fraud_prevented"`
	}
	var counts dashCounts
	if err := config.DB.Model(&model.PublicVerifyLog{}).
		Select(`COUNT(*) AS total_verified,
			COUNT(DISTINCT ip) AS unique_ips,
			COALESCE(SUM(CASE WHEN status IN ('blocked', 'quota') THEN 1 ELSE 0 END), 0) AS fraud_prevented`).
		Where("created_at > ?", yesterday).
		Scan(&counts).Error; err != nil {
		logger.Error("Failed to fetch public verifier dashboard counts", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch security dashboard", "ERR_SECURITY_DASHBOARD")
		return
	}

	var currentlyBlocked int64
	if err := config.DB.Model(&model.BlockedClient{}).Count(&currentlyBlocked).Error; err != nil {
		logger.Error("Failed to count blocked clients", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch security dashboard", "ERR_SECURITY_DASHBOARD")
		return
	}

	dailyLimit := "10"
	var limitSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "daily_free_limit").First(&limitSetting).Error; err == nil {
		dailyLimit = limitSetting.SettingValue
	}

	verifierEnabled := true
	var toggleSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "public_verifier_enabled").First(&toggleSetting).Error; err == nil {
		verifierEnabled = toggleSetting.SettingValue != "false"
	}

	helper.SendSuccess(c, "Security dashboard retrieved", gin.H{
		"total_verified":    counts.TotalVerified,
		"unique_ips":        counts.UniqueIPs,
		"fraud_prevented":   counts.FraudPrevented,
		"currently_blocked": currentlyBlocked,
		"daily_limit":       dailyLimit,
		"verifier_enabled":  verifierEnabled,
	})
}

// GetSecurityVerifyLogs returns the real-time stream of verifications
func (h *AdminHandler) GetSecurityVerifyLogs(c *gin.Context) {
	var logs []model.PublicVerifyLog
	if err := config.DB.Order("created_at desc").Limit(50).Find(&logs).Error; err != nil {
		logger.Error("Failed to fetch verification logs", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch verification logs", "ERR_SECURITY_LOGS")
		return
	}
	helper.SendSuccess(c, "Verification logs retrieved", logs)
}

// GetSecurityBlocklist returns the list of blocked IPs and Cookies
func (h *AdminHandler) GetSecurityBlocklist(c *gin.Context) {
	var blocks []model.BlockedClient
	if err := config.DB.Order("blocked_at desc").Limit(100).Find(&blocks).Error; err != nil {
		logger.Error("Failed to fetch blocklist", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch blocklist", "ERR_SECURITY_BLOCKLIST")
		return
	}
	helper.SendSuccess(c, "Blocklist retrieved", blocks)
}

// SecurityUnblock removes an IP or Cookie from the blocklist
func (h *AdminHandler) SecurityUnblock(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		ID      uint   `json:"id" binding:"required"`
		Confirm string `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Type UNBLOCK to confirm", "ERR_BAD_REQUEST")
		return
	}
	if !normalizeUnblockConfirm(input.Confirm) {
		helper.SendError(c, http.StatusBadRequest, "Type UNBLOCK to confirm", "ERR_SECURITY_CONFIRM")
		return
	}

	var block model.BlockedClient
	if err := config.DB.First(&block, input.ID).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "Blocked client not found", "ERR_SECURITY_NOT_FOUND")
		return
	}

	// Hard delete so unique(value) is freed cleanly for future re-blocks.
	if err := config.DB.Unscoped().Delete(&model.BlockedClient{}, input.ID).Error; err != nil {
		logger.Error("Failed to unblock client", "error", err, "id", input.ID)
		helper.SendError(c, http.StatusInternalServerError, "Failed to unblock", "ERR_SECURITY_UNBLOCK")
		return
	}

	logAction(adminID, "WARN", "Admin",
		fmt.Sprintf("Unblocked %s %s (%s)", block.Type, block.Value, block.BlockType))

	helper.SendSuccess(c, "Client unblocked successfully", nil)
}

// UpdateSecuritySettings updates limit and toggle
func (h *AdminHandler) UpdateSecuritySettings(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		DailyLimit      *string `json:"daily_limit"`
		VerifierEnabled *bool   `json:"verifier_enabled"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid settings payload", "ERR_BAD_REQUEST")
		return
	}
	if input.DailyLimit == nil && input.VerifierEnabled == nil {
		helper.SendError(c, http.StatusBadRequest, "No settings provided", "ERR_BAD_REQUEST")
		return
	}

	changes := make([]string, 0, 2)

	if input.DailyLimit != nil {
		limit := strings.TrimSpace(*input.DailyLimit)
		if _, ok := allowedDailyFreeLimits[limit]; !ok {
			helper.SendError(c, http.StatusBadRequest, "Daily limit must be 5, 10, 15, or 20", "ERR_SECURITY_LIMIT")
			return
		}
		setting := model.Setting{SettingKey: "daily_free_limit", SettingValue: limit}
		if err := config.DB.Where("setting_key = ?", "daily_free_limit").
			Assign(setting).FirstOrCreate(&setting).Error; err != nil {
			logger.Error("Failed to update daily_free_limit", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to update settings", "ERR_SECURITY_SETTINGS")
			return
		}
		security.ClearDailyFreeLimitCache()
		changes = append(changes, "daily_limit="+limit)
	}

	if input.VerifierEnabled != nil {
		val := "false"
		if *input.VerifierEnabled {
			val = "true"
		}
		setting := model.Setting{SettingKey: "public_verifier_enabled", SettingValue: val}
		if err := config.DB.Where("setting_key = ?", "public_verifier_enabled").
			Assign(setting).FirstOrCreate(&setting).Error; err != nil {
			logger.Error("Failed to update public_verifier_enabled", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to update settings", "ERR_SECURITY_SETTINGS")
			return
		}
		ClearPublicVerifierEnabledCache()
		changes = append(changes, "verifier_enabled="+val)
	}

	logAction(adminID, "INFO", "Admin", "Public verifier settings updated: "+strings.Join(changes, ", "))
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
