package handler

import (
	"io"
	"net/http"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/logger"

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
		helper.SendError(c, http.StatusBadRequest, "Invalid request", "ERR_INVALID_REQUEST")
		return
	}

	provider := input.Provider
	if provider == "" {
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
		errStr := err.Error()
		switch {
		case errStr == "package not found":
			helper.SendError(c, http.StatusNotFound, "Package not found", "ERR_PACKAGE_NOT_FOUND")
		case strings.Contains(errStr, "package not available"):
			helper.SendError(c, http.StatusBadRequest, "This package is not available for purchase.", "ERR_PACKAGE_UNAVAILABLE")
		case strings.Contains(errStr, "not enabled"):
			helper.SendError(c, http.StatusServiceUnavailable, "This payment method is not available.", "ERR_PROVIDER_DISABLED")
		case strings.Contains(errStr, "temporarily unavailable"):
			helper.SendError(c, http.StatusServiceUnavailable, "Payment provider is temporarily unavailable.", "ERR_PROVIDER_UNAVAILABLE")
		case strings.Contains(errStr, "manual payment"):
			helper.SendError(c, http.StatusForbidden, "Manual payment is not allowed.", "ERR_MANUAL_DISABLED")
		default:
			logger.Error("CreatePaymentSession failed", "provider", provider, "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to create payment session", "ERR_CREATE_SESSION")
		}
		return
	}

	// Aliases keep older FE clients working (approval_url / payment_url)
	helper.SendSuccess(c, "Payment session created", gin.H{
		"checkout_url": url,
		"approval_url": url,
		"payment_url":  url,
	})
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

	if !validPaymentProviders[provider] {
		helper.SendError(c, http.StatusBadRequest, "Unknown payment provider", "ERR_INVALID_PROVIDER")
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 5*1024*1024)

	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read request body", "ERR_BAD_BODY")
		return
	}

	headers := make(map[string]string)
	for k, v := range c.Request.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}

	if err := h.paymentService.ProcessWebhook(provider, rawBody, headers); err != nil {
		logger.Error("Webhook processing failed", "provider", provider, "error", err)
		errStr := err.Error()
		switch {
		case strings.Contains(errStr, "not enabled"):
			helper.SendError(c, http.StatusServiceUnavailable, "Provider not enabled", "ERR_PROVIDER_DISABLED")
		case strings.Contains(errStr, "signature") || strings.Contains(errStr, "Signature"):
			helper.SendError(c, http.StatusUnauthorized, "Invalid webhook signature", "ERR_INVALID_SIGNATURE")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Webhook processing failed", "ERR_WEBHOOK_FAILED")
		}
		return
	}

	helper.SendSuccess(c, "Webhook processed", nil)
}

func (h *PaymentHandler) VerifyPayment(c *gin.Context) {
	userID, _ := c.Get("userID")
	txid := c.Query("txid")
	if txid == "" {
		helper.SendError(c, http.StatusBadRequest, "Transaction ID is required", "ERR_MISSING_TXID")
		return
	}

	status, err := h.paymentService.VerifyPayment(userID.(uint), txid)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to verify payment", "ERR_VERIFY_FAILED")
		return
	}

	helper.SendSuccess(c, "Payment verification status", gin.H{"status": status})
}

func (h *PaymentHandler) CapturePayPal(c *gin.Context) {
	userID, _ := c.Get("userID")
	var input struct {
		OrderID string `json:"order_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.paymentService.CapturePayPalOrder(userID.(uint), input.OrderID); err != nil {
		errStr := err.Error()
		switch {
		case errStr == "payment not found" || errStr == "order id required":
			helper.SendError(c, http.StatusNotFound, "Payment not found", "ERR_PAYMENT_NOT_FOUND")
		case strings.Contains(errStr, "not enabled"):
			helper.SendError(c, http.StatusServiceUnavailable, "PayPal is not available", "ERR_PROVIDER_DISABLED")
		default:
			logger.Error("PayPal capture failed", "error", err)
			helper.SendError(c, http.StatusInternalServerError, "Failed to capture PayPal payment", "ERR_PAYPAL_CAPTURE")
		}
		return
	}

	helper.SendSuccess(c, "PayPal payment captured", nil)
}
