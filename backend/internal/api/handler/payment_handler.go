package handler

import (
	"net/http"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type PaymentHandler struct {
	paymentService service.PaymentService
}

func NewPaymentHandler(paymentService service.PaymentService) *PaymentHandler {
	return &PaymentHandler{paymentService: paymentService}
}

func (h *PaymentHandler) CreateSession(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		PackageID uint   `json:"package_id" binding:"required"`
		Provider  string `json:"provider"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	provider := input.Provider
	if provider == "" {
		// Fallback to URL path if body doesn't specify provider
		if c.FullPath() == "/api/v1/payment/stripe/create" {
			provider = "stripe"
		} else if c.FullPath() == "/api/v1/payment/paypal/create" {
			provider = "paypal"
		} else if c.FullPath() == "/api/v1/payment/cryptomus/create" {
			provider = "cryptomus"
		}
	}

	if provider == "" {
		helper.SendError(c, http.StatusBadRequest, "Payment provider is required", "ERR_MISSING_PROVIDER")
		return
	}

	url, err := h.paymentService.CreatePaymentSession(userID.(uint), input.PackageID, provider)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to create session", err.Error())
		return
	}
	helper.SendSuccess(c, "Payment session created", gin.H{"checkout_url": url})
}

func (h *PaymentHandler) HandleWebhook(c *gin.Context) {
	provider := c.Param("provider")
	// Process payload for provider
	_ = provider
	helper.SendSuccess(c, "Webhook processed", nil)
}
