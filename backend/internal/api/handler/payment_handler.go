package handler

import (
	"io"
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

// validPaymentProviders is the explicit whitelist of supported payment gateways.
var validPaymentProviders = map[string]bool{
	"stripe":    true,
	"paypal":    true,
	"cryptomus": true,
}

func (h *PaymentHandler) HandleWebhook(c *gin.Context) {
	provider := c.Param("provider")
	if provider == "" {
		helper.SendError(c, http.StatusBadRequest, "Payment provider is required", "ERR_MISSING_PROVIDER")
		return
	}

	// C1 Fix: Validate provider against strict whitelist
	if !validPaymentProviders[provider] {
		helper.SendError(c, http.StatusBadRequest, "Unknown payment provider", "ERR_INVALID_PROVIDER")
		return
	}

	// Limit webhook body to 5MB to prevent memory exhaustion attacks
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 5*1024*1024)

	// Read the raw webhook payload
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read request body", err.Error())
		return
	}

	// Extract headers
	headers := make(map[string]string)
	for k, v := range c.Request.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	if err := h.paymentService.ProcessWebhook(provider, rawBody, headers); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Webhook processing failed", err.Error())
		return
	}

	helper.SendSuccess(c, "Webhook processed", nil)
}

func (h *PaymentHandler) VerifyPayment(c *gin.Context) {
	txid := c.Query("txid")
	if txid == "" {
		helper.SendError(c, http.StatusBadRequest, "Transaction ID is required", "ERR_MISSING_TXID")
		return
	}

	status, err := h.paymentService.VerifyPayment(txid)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to verify payment", err.Error())
		return
	}

	helper.SendSuccess(c, "Payment verification status", gin.H{"status": status})
}

