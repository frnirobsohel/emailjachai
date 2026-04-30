package handler

import (
	"fmt"
	"net/http"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/logger"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

func GetAPIKeys(c *gin.Context) {
	rawUserID, _ := c.Get("userID")
	userID := rawUserID.(uint)

	var keys []model.APIKey
	// Legacy Parity: Filter out internal system keys
	if err := config.DB.Where("user_id = ? AND status != 'revoked' AND name NOT IN ('Login Key', 'Impersonation Key')", userID).
		Order("created_at DESC").Find(&keys).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch API keys", "")
		return
	}

	// Transform for frontend parity
	type APIKeyResponse struct {
		ID        uint   `json:"id"`
		Name      string `json:"name"`
		KeyMasked string `json:"key_masked"`
		Created   string `json:"created"`
		LastUsed  string `json:"last_used"`
		Status    string `json:"status"`
	}

	response := make([]APIKeyResponse, len(keys))
	for i, k := range keys {
		lastUsed := "Never"
		if k.LastUsedAt != nil {
			lastUsed = k.LastUsedAt.Format("2006-01-02 15:04")
		}

		response[i] = APIKeyResponse{
			ID:        k.ID,
			Name:      k.Name,
			KeyMasked: k.KeyPrefix + "****************",
			Created:   k.CreatedAt.Format("2006-01-02"),
			LastUsed:  lastUsed,
			Status:    k.Status,
		}
	}

	helper.SendSuccess(c, "API keys retrieved", response)
}

func CreateAPIKey(c *gin.Context) {
	rawUserID, _ := c.Get("userID")
	userID := rawUserID.(uint)

	var input struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	// Legacy Parity: Max 5 active keys
	var activeCount int64
	config.DB.Model(&model.APIKey{}).Where("user_id = ? AND status = 'active'", userID).Count(&activeCount)
	if activeCount >= 5 {
		helper.SendError(c, http.StatusBadRequest, "Maximum 5 active API keys allowed per user.", "ERR_LIMIT_EXCEEDED")
		return
	}

	rawKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := ""
	if len(rawKey) >= 16 {
		prefix = rawKey[:16]
	}
	hashedKey, _ := helper.HashPassword(rawKey)

	key := model.APIKey{
		UserID:    userID,
		Name:      input.Name,
		APIKey:    hashedKey,
		Key:       hashedKey, // Match DB column 'key'
		KeyPrefix: prefix,
		Status:    "active",
	}

	if err := config.DB.Create(&key).Error; err != nil {
		logger.Error("Failed to create API key", "user_id", userID, "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to create API key", err.Error())
		return
	}

	// For creation, we return the raw key ONCE
	helper.SendSuccess(c, "API key created successfully", gin.H{
		"id":         key.ID,
		"name":       key.Name,
		"api_key":    rawKey,
		"key_masked": prefix + "****************",
	})
}

func DeleteAPIKey(c *gin.Context) {
	rawUserID, _ := c.Get("userID")
	userID := rawUserID.(uint)

	keyID := c.Param("id")
	if keyID == "" {
		var input struct {
			ID uint `json:"id"`
		}
		if err := c.ShouldBindJSON(&input); err == nil && input.ID != 0 {
			keyID = fmt.Sprintf("%d", input.ID)
		}
	}

	if keyID == "" {
		helper.SendError(c, http.StatusBadRequest, "Key ID is required", "")
		return
	}

	if err := config.DB.Where("id = ? AND user_id = ?", keyID, userID).Delete(&model.APIKey{}).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to revoke API key", "")
		return
	}

	helper.SendSuccess(c, "API key revoked successfully", nil)
}

func ShowAPIKey(c *gin.Context) {
	helper.SendError(c, http.StatusForbidden, "For security, API keys can only be viewed once during creation.", "ERR_KEY_NOT_VIEWABLE")
}

func RotateAPIKey(c *gin.Context) {
	rawUserID, _ := c.Get("userID")
	userID := rawUserID.(uint)
	keyID := c.Param("id")
	if keyID == "" {
		keyID = c.Query("id")
	}
	if keyID == "" {
		var input struct {
			ID uint `json:"id"`
		}
		if err := c.ShouldBindJSON(&input); err == nil && input.ID != 0 {
			keyID = fmt.Sprintf("%d", input.ID)
		}
	}
	if keyID == "" {
		helper.SendError(c, http.StatusBadRequest, "Key ID is required", "")
		return
	}

	var key model.APIKey
	if err := config.DB.Where("id = ? AND user_id = ?", keyID, userID).First(&key).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "API Key not found", "ERR_KEY_NOT_FOUND")
		return
	}

	rawKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := ""
	if len(rawKey) >= 16 {
		prefix = rawKey[:16]
	}
	hashedKey, _ := helper.HashPassword(rawKey)

	if err := config.DB.Model(&key).Updates(map[string]interface{}{
		"api_key":    hashedKey,
		"key":        hashedKey,
		"key_prefix": prefix,
	}).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to rotate API Key", "")
		return
	}

	helper.SendSuccess(c, "API Key rotated successfully", gin.H{
		"api_key":    rawKey,
		"key_masked": prefix + "****************",
	})
}



