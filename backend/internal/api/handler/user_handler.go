package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService    service.UserService
	jobService     service.JobService
	paymentService service.PaymentService
	resellerService service.ResellerService
}

func NewUserHandler(userService service.UserService, jobService service.JobService, paymentService service.PaymentService, resellerService service.ResellerService) *UserHandler {
	return &UserHandler{
		userService:     userService,
		jobService:      jobService,
		paymentService:  paymentService,
		resellerService: resellerService,
	}
}

func (h *UserHandler) DashboardHistory(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			if parsedLimit > 100 {
				limit = 100
			} else {
				limit = parsedLimit
			}
		}
	}

	offset := 0
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	loc := time.UTC
	if tz := strings.TrimSpace(c.Query("tz")); tz != "" {
		if loaded, err := time.LoadLocation(tz); err == nil {
			loc = loaded
		}
	}

	txs, total, err := h.paymentService.GetTransactionHistory(userID, limit, offset)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch history", "ERR_FETCH_HISTORY")
		return
	}

	formattedTransactions := make([]map[string]interface{}, 0, len(txs))
	for _, tx := range txs {
		amountPrefix := ""
		if tx.CreditsAdded > 0 {
			amountPrefix = "+"
		}

		txnID := tx.TransactionID
		if txnID == "" {
			txnID = fmt.Sprintf("%d", tx.ID)
		}

		cost := "—"
		if tx.Type == "purchase" || tx.Amount > 0 {
			cost = fmt.Sprintf("$%.2f", tx.Amount)
		}

		formattedTransactions = append(formattedTransactions, map[string]interface{}{
			"id":          txnID,
			"date":        tx.CreatedAt.In(loc).Format("2006-01-02 15:04:05"),
			"amount":      fmt.Sprintf("%s%d Credits", amountPrefix, tx.CreditsAdded),
			"type":        toTitleCase(strings.ReplaceAll(tx.Type, "_", " ")),
			"status":      toTitleCase(tx.Status),
			"cost":        cost,
			"package":     tx.Package,
			"description": tx.Description,
		})
	}

	helper.SendSuccess(c, "Dashboard history retrieved", gin.H{
		"transactions": formattedTransactions,
		"total":        total,
	})
}

func (h *UserHandler) GetWebhookSettings(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	user, err := h.userService.GetByID(userID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "User not found", "ERR_USER_NOT_FOUND")
		return
	}

	helper.SendSuccess(c, "Webhook settings retrieved", gin.H{
		"webhook_url": user.WebhookURL,
		"has_secret":  strings.TrimSpace(user.WebhookSecret) != "",
	})
}

func (h *UserHandler) UpdateWebhookSettings(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var input struct {
		WebhookURL       string `json:"webhook_url"`
		WebhookSecret    string `json:"webhook_secret"`
		RegenerateSecret bool   `json:"regenerate_secret"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request body", "ERR_INVALID_REQUEST")
		return
	}

	plainOnce, err := h.userService.UpdateWebhookSettings(userID, input.WebhookURL, input.WebhookSecret, input.RegenerateSecret)
	if err != nil {
		errStr := err.Error()
		switch {
		case errors.Is(err, service.ErrWebhookSecretTooShort):
			helper.SendError(c, http.StatusBadRequest, "Webhook secret must be at least 16 characters.", "ERR_WEBHOOK_SECRET")
		case strings.Contains(errStr, "https") || strings.Contains(errStr, "private") || strings.Contains(errStr, "invalid webhook") || strings.Contains(errStr, "resolved"):
			helper.SendError(c, http.StatusBadRequest, errStr, "ERR_WEBHOOK_URL")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Failed to update webhook settings", "ERR_WEBHOOK_UPDATE")
		}
		return
	}

	hasSecret := plainOnce != ""
	if !hasSecret && strings.TrimSpace(input.WebhookURL) != "" {
		if updated, getErr := h.userService.GetByID(userID); getErr == nil {
			hasSecret = strings.TrimSpace(updated.WebhookSecret) != ""
		}
	}
	resp := gin.H{
		"webhook_url": strings.TrimSpace(input.WebhookURL),
		"has_secret":  hasSecret,
	}
	if plainOnce != "" {
		resp["webhook_secret"] = plainOnce
	}
	helper.SendSuccess(c, "Webhook settings updated", resp)
}

func (h *UserHandler) TransferCredits(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input struct {
		Email          string `json:"email" binding:"required,email"`
		Amount         int    `json:"amount" binding:"required,gt=0"`
		IdempotencyKey string `json:"idempotencyKey"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Valid recipient email and a credit amount greater than zero are required.", "ERR_INVALID_REQUEST")
		return
	}

	idempotencyKey := strings.TrimSpace(input.IdempotencyKey)
	if idempotencyKey == "" {
		idempotencyKey = strings.TrimSpace(c.GetHeader("X-Idempotency-Key"))
	}

	result, err := h.resellerService.TransferCredits(userID.(uint), input.Email, input.Amount, idempotencyKey)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferAmountInvalid):
			helper.SendError(c, http.StatusBadRequest, "Transfer amount must be greater than zero.", "ERR_TRANSFER_AMOUNT")
		case errors.Is(err, service.ErrTransferRecipientMissing):
			helper.SendError(c, http.StatusNotFound, "Recipient user not found.", "ERR_RECIPIENT_NOT_FOUND")
		case errors.Is(err, service.ErrTransferSelf):
			helper.SendError(c, http.StatusBadRequest, "You cannot transfer credits to yourself.", "ERR_TRANSFER_SELF")
		case errors.Is(err, service.ErrTransferRecipientRole):
			helper.SendError(c, http.StatusBadRequest, "Credits can only be transferred to regular user accounts.", "ERR_TRANSFER_RECIPIENT_ROLE")
		case errors.Is(err, service.ErrTransferUnauthorized):
			helper.SendError(c, http.StatusForbidden, "Only resellers or admins can transfer credits.", "ERR_FORBIDDEN")
		case errors.Is(err, service.ErrTransferInsufficient):
			helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits for transfer.", "ERR_INSUFFICIENT_CREDITS")
		case errors.Is(err, service.ErrTransferRecipientStatus):
			helper.SendError(c, http.StatusBadRequest, "Cannot transfer credits to a suspended or inactive account.", "ERR_RECIPIENT_STATUS")
		case errors.Is(err, service.ErrTransferIdempotencyBusy):
			helper.SendError(c, http.StatusConflict, "A transfer with this idempotency key is already in progress.", "ERR_IDEMPOTENCY_IN_PROGRESS")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Transfer failed. Please try again.", "ERR_TRANSFER_FAILED")
		}
		return
	}

	msg := fmt.Sprintf("Successfully transferred %d credits to %s", input.Amount, strings.ToLower(strings.TrimSpace(input.Email)))
	if result != nil && result.AlreadyProcessed {
		msg = "Transfer already processed."
	}
	helper.SendSuccess(c, msg, result)
}

// toTitleCase converts "transfer_out" → "Transfer Out" without using
// the deprecated strings.Title function.
func toTitleCase(s string) string {
	if s == "" {
		return ""
	}
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
		}
	}
	return strings.Join(words, " ")
}
