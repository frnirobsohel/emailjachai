package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type APIKeyHandler struct {
	apiKeyService service.APIKeyService
}

func NewAPIKeyHandler(apiKeyService service.APIKeyService) *APIKeyHandler {
	return &APIKeyHandler{apiKeyService: apiKeyService}
}

func apiKeyPlainDTO(id uint, name, plainKey, prefix string) gin.H {
	masked := prefix + strings.Repeat("*", 20)
	if prefix == "" && len(plainKey) >= 16 {
		masked = plainKey[:16] + strings.Repeat("*", 20)
	}
	return gin.H{
		"id":         id,
		"name":       name,
		"api_key":    plainKey,
		"key_masked": masked,
	}
}

func (h *APIKeyHandler) GetAPIKeys(c *gin.Context) {
	userID, _ := c.Get("userID")
	keys, err := h.apiKeyService.GetByUserID(userID.(uint))
	if err != nil {
		logger.Error("Failed to fetch API keys", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch keys", "ERR_FETCH_KEYS")
		return
	}

	loc := time.UTC
	if tz := strings.TrimSpace(c.Query("tz")); tz != "" {
		if loaded, err := time.LoadLocation(tz); err == nil {
			loc = loaded
		}
	}

	var stats []struct {
		APIKeyID    uint
		SingleJobs  int
		BulkJobs    int
		CreditsUsed int
	}

	config.DB.Table("jobs").
		Select("api_key_id, sum(case when type = 'single' then 1 else 0 end) as single_jobs, sum(case when type = 'bulk' then 1 else 0 end) as bulk_jobs, sum(total_emails) as credits_used").
		Where("user_id = ? AND api_key_id IS NOT NULL", userID).
		Group("api_key_id").
		Scan(&stats)

	statsMap := make(map[uint]struct{ SingleJobs, BulkJobs, CreditsUsed int })
	for _, s := range stats {
		statsMap[s.APIKeyID] = struct{ SingleJobs, BulkJobs, CreditsUsed int }{s.SingleJobs, s.BulkJobs, s.CreditsUsed}
	}

	formattedKeys := make([]map[string]interface{}, 0)
	for _, k := range keys {
		if k.Name == "Login Key" || k.Name == "Impersonation Key" {
			continue
		}

		lastUsed := "Never"
		if k.LastUsedAt != nil {
			lastUsed = k.LastUsedAt.In(loc).Format("2006-01-02 15:04")
		}

		keyStats := statsMap[k.ID]

		formattedKeys = append(formattedKeys, map[string]interface{}{
			"id":           k.ID,
			"name":         k.Name,
			"key_masked":   k.KeyPrefix + strings.Repeat("*", 20),
			"created":      k.CreatedAt.In(loc).Format("2006-01-02"),
			"status":       k.Status,
			"last_used":    lastUsed,
			"single_jobs":  keyStats.SingleJobs,
			"bulk_jobs":    keyStats.BulkJobs,
			"credits_used": keyStats.CreditsUsed,
		})
	}

	helper.SendSuccess(c, "API keys retrieved", formattedKeys)
}

func (h *APIKeyHandler) CreateAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		Name string `json:"name" binding:"required,max=50"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "API Key name must be between 1 and 50 characters", "ERR_INVALID_INPUT")
		return
	}

	key, err := h.apiKeyService.Create(userID.(uint), input.Name)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrMaxAPIKeys):
			helper.SendError(c, http.StatusBadRequest, "Maximum 5 active API keys allowed per user", "ERR_LIMIT_EXCEEDED")
		case errors.Is(err, service.ErrReservedKeyName):
			helper.SendError(c, http.StatusBadRequest, "This key name is reserved. Please choose another name.", "ERR_RESERVED_NAME")
		case errors.Is(err, service.ErrAPIKeyGenerateFailed):
			helper.SendError(c, http.StatusInternalServerError, "Failed to generate API key", "ERR_KEY_GENERATE")
		default:
			logger.Error("Failed to create API key", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to create key", "ERR_CREATE_KEY")
		}
		return
	}

	helper.SendSuccess(c, "API key created successfully", apiKeyPlainDTO(key.ID, key.Name, key.APIKey, key.KeyPrefix))
}

func (h *APIKeyHandler) DeleteAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.apiKeyService.Delete(input.ID, userID.(uint)); err != nil {
		switch {
		case errors.Is(err, service.ErrSystemKeyProtected):
			helper.SendError(c, http.StatusForbidden, "System keys cannot be revoked.", "ERR_SYSTEM_KEY")
		case errors.Is(err, service.ErrAPIKeyNotFound), errors.Is(err, gorm.ErrRecordNotFound):
			helper.SendError(c, http.StatusNotFound, "API key not found", "ERR_KEY_NOT_FOUND")
		default:
			logger.Error("Failed to delete API key", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to delete key", "ERR_DELETE_KEY")
		}
		return
	}

	h.apiKeyService.InvalidateCacheByKeyID(input.ID)
	helper.SendSuccess(c, "API key deleted successfully", nil)
}

func (h *APIKeyHandler) RotateAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", "ERR_INVALID_REQUEST")
		return
	}

	h.apiKeyService.InvalidateCacheByKeyID(input.ID)

	key, err := h.apiKeyService.Rotate(input.ID, userID.(uint))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrSystemKeyProtected):
			helper.SendError(c, http.StatusForbidden, "System keys cannot be rotated.", "ERR_SYSTEM_KEY")
		case errors.Is(err, service.ErrAPIKeyNotFound):
			helper.SendError(c, http.StatusNotFound, "API key not found", "ERR_KEY_NOT_FOUND")
		case errors.Is(err, service.ErrAPIKeyNotActive):
			helper.SendError(c, http.StatusBadRequest, "Only active API keys can be rotated.", "ERR_KEY_NOT_ACTIVE")
		case errors.Is(err, service.ErrAPIKeyGenerateFailed):
			helper.SendError(c, http.StatusInternalServerError, "Failed to generate API key", "ERR_KEY_GENERATE")
		default:
			logger.Error("Failed to rotate API key", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to rotate key", "ERR_ROTATE_KEY")
		}
		return
	}

	helper.SendSuccess(c, "API key rotated successfully", apiKeyPlainDTO(key.ID, key.Name, key.APIKey, key.KeyPrefix))
}
