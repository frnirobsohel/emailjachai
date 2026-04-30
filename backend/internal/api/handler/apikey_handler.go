package handler

import (
	"net/http"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

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

		formattedKeys = append(formattedKeys, map[string]interface{}{
			"id":         k.ID,
			"name":       k.Name,
			"key_masked": k.KeyPrefix + strings.Repeat("*", 20),
			"created":    k.CreatedAt.Format("2006-01-02"),
			"status":     k.Status,
			"last_used":  lastUsed,
		})
	}

	helper.SendSuccess(c, "API keys retrieved", formattedKeys)
}

func (h *APIKeyHandler) CreateAPIKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	key, err := h.apiKeyService.Create(userID.(uint), input.Name)
	if err != nil {
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

	key, err := h.apiKeyService.Rotate(input.ID, userID.(uint))
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to rotate key", err.Error())
		return
	}
	helper.SendSuccess(c, "API key rotated successfully", key)
}
