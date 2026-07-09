package handler

import (
	"net/http"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

type APIKeyHandler struct {
	apiKeyService service.APIKeyService
}

func NewAPIKeyHandler(apiKeyService service.APIKeyService) *APIKeyHandler {
	return &APIKeyHandler{apiKeyService: apiKeyService}
}

func (h *APIKeyHandler) GetAPIKeys(c *gin.Context) {
	userID, _ := c.Get("userID")
	keys, err := h.apiKeyService.GetByUserID(userID.(uint))
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch keys", err.Error())
		return
	}

	// Fetch real usage statistics per API key
	var stats []struct {
		APIKeyID       uint
		SingleJobs     int
		BulkJobs       int
		CreditsUsed    int
	}
	
	config.DB.Table("jobs").
		Select("api_key_id, sum(case when type = 'single' then 1 else 0 end) as single_jobs, sum(case when type = 'bulk' then 1 else 0 end) as bulk_jobs, sum(total_emails) as credits_used").
		Where("user_id = ? AND api_key_id IS NOT NULL", userID).
		Group("api_key_id").
		Scan(&stats)

	// Create a map for O(1) lookup
	statsMap := make(map[uint]struct{SingleJobs, BulkJobs, CreditsUsed int})
	for _, s := range stats {
		statsMap[s.APIKeyID] = struct{SingleJobs, BulkJobs, CreditsUsed int}{s.SingleJobs, s.BulkJobs, s.CreditsUsed}
	}
	
	formattedKeys := make([]map[string]interface{}, 0)
	for _, k := range keys {
		// Filter out Login and Impersonation keys from the list (Legacy Parity)
		if k.Name == "Login Key" || k.Name == "Impersonation Key" {
			continue
		}

		lastUsed := "Never"
		if k.LastUsedAt != nil {
			lastUsed = k.LastUsedAt.Format("2006-01-02 15:04")
		}

		keyStats := statsMap[k.ID]

		formattedKeys = append(formattedKeys, map[string]interface{}{
			"id":            k.ID,
			"name":          k.Name,
			"key_masked":    k.KeyPrefix + strings.Repeat("*", 20),
			"created":       k.CreatedAt.Format("2006-01-02"),
			"status":        k.Status,
			"last_used":     lastUsed,
			"single_jobs":   keyStats.SingleJobs,
			"bulk_jobs":     keyStats.BulkJobs,
			"credits_used":  keyStats.CreditsUsed,
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
		if err.Error() == "maximum 5 active API keys allowed per user" {
			helper.SendError(c, http.StatusBadRequest, err.Error(), "ERR_LIMIT_EXCEEDED")
			return
		}
		helper.SendError(c, http.StatusInternalServerError, "Failed to create key", err.Error())
		return
	}
	helper.SendSuccess(c, "API key created successfully", key)
}

func (h *APIKeyHandler) DeleteAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if err := h.apiKeyService.Delete(input.ID, userID.(uint)); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete key", err.Error())
		return
	}

	// M1 Fix: Clear API auth cache so the revoked key stops working immediately
	// (previously revoked keys remained valid for up to 2 minutes via in-memory cache)
	h.apiKeyService.InvalidateCacheByKeyID(input.ID)

	helper.SendSuccess(c, "API key deleted successfully", nil)
}

func (h *APIKeyHandler) RotateAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	// M1 Fix: Clear cache for old key before rotating
	h.apiKeyService.InvalidateCacheByKeyID(input.ID)

	key, err := h.apiKeyService.Rotate(input.ID, userID.(uint))
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to rotate key", err.Error())
		return
	}
	helper.SendSuccess(c, "API key rotated successfully", key)
}
