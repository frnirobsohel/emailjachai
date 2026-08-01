package handler

import (
	"net/http"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

// GetPaymentSettings returns gateway flags, non-secret fields, has_* booleans, and webhook URLs.
func (h *AdminHandler) GetPaymentSettings(c *gin.Context) {
	view, err := h.settingsService.GetPaymentSettings()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch payment settings", "ERR_PAYMENT_FETCH")
		return
	}
	helper.SendSuccess(c, "Payment settings retrieved", view)
}

// UpdatePaymentSettings saves one provider (+ optional api_base_url) with enable/credential checks.
func (h *AdminHandler) UpdatePaymentSettings(c *gin.Context) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input service.PaymentGatewayUpdate
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid payment settings payload", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.settingsService.UpdatePaymentSettings(input, adminID); err != nil {
		mapSettingsError(c, err)
		return
	}

	config.ClearPublicSettingsCache()
	view, _ := h.settingsService.GetPaymentSettings()
	helper.SendSuccess(c, "Payment settings updated successfully", view)
}

// TestPaymentSettings verifies stored credentials decrypt for the given provider.
func (h *AdminHandler) TestPaymentSettings(c *gin.Context) {
	var input struct {
		Provider string `json:"provider" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Provider is required", "ERR_INVALID_REQUEST")
		return
	}

	msg, err := h.settingsService.TestPaymentGateway(input.Provider)
	if err != nil {
		mapSettingsError(c, err)
		return
	}
	helper.SendSuccess(c, msg, nil)
}
