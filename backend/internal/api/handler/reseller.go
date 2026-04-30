package handler

import (
	"fmt"
	"net/http"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// TransferCredits allows a reseller to transfer their credits to another user
func TransferCredits(c *gin.Context) {
	resellerID, exists := c.Get("userID")
	role, _ := c.Get("role")

	if !exists || role != "reseller" && role != "admin" {
		helper.SendError(c, http.StatusForbidden, "Only resellers or admins can transfer credits", "ERR_FORBIDDEN")
		return
	}

	var input struct {
		ReceiverEmail string `json:"receiver_email"`
		Email         string `json:"email"` // Frontend alias
		Amount        int    `json:"amount" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	targetEmail := input.ReceiverEmail
	if targetEmail == "" {
		targetEmail = input.Email
	}

	if targetEmail == "" {
		helper.SendError(c, http.StatusBadRequest, "Receiver email is required", "")
		return
	}

	// Begin Database Transaction
	tx := config.DB.Begin()

	var sender model.User
	if err := tx.First(&sender, resellerID).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusNotFound, "Sender not found", "ERR_NOT_FOUND")
		return
	}

	if sender.Credits < input.Amount {
		tx.Rollback()
		helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits to transfer", "ERR_INSUFFICIENT_CREDITS")
		return
	}

	var receiver model.User
	if err := tx.Where("email = ?", targetEmail).First(&receiver).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusNotFound, "Receiver email not found", "ERR_RECEIVER_NOT_FOUND")
		return
	}

	// Update Credits
	if err := tx.Model(&sender).Update("credits", sender.Credits-input.Amount).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusInternalServerError, "Failed to deduct credits", "")
		return
	}

	if err := tx.Model(&receiver).Update("credits", receiver.Credits+input.Amount).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusInternalServerError, "Failed to add credits", "")
		return
	}

	// 5. Log Transactions (Legacy Parity)
	// To Sender (Out)
	senderTransaction := model.Transaction{
		UserID:        sender.ID,
		TransactionID: "TRF_OUT_" + helper.GenerateRandomHex(10),
		Amount:        0,
		CreditsAdded:  -input.Amount,
		Type:          "transfer_out",
		Status:        "completed",
		Provider:      "system",
		Description:   fmt.Sprintf("Transferred %d credits to %s", input.Amount, receiver.Email),
	}
	if err := tx.Create(&senderTransaction).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusInternalServerError, "Failed to log sender transaction", "")
		return
	}

	// To Recipient (In)
	receiverTransaction := model.Transaction{
		UserID:        receiver.ID,
		TransactionID: "TRF_IN_" + helper.GenerateRandomHex(10),
		Amount:        0,
		CreditsAdded:  input.Amount,
		Type:          "transfer_in",
		Status:        "completed",
		Provider:      "system",
		Description:   fmt.Sprintf("Received %d credits from %s", input.Amount, sender.Email),
	}
	if err := tx.Create(&receiverTransaction).Error; err != nil {
		tx.Rollback()
		helper.SendError(c, http.StatusInternalServerError, "Failed to log receiver transaction", "")
		return
	}

	// Commit Transaction
	if err := tx.Commit().Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to finalize credit transfer", "")
		return
	}

	helper.SendSuccess(c, "Credits transferred successfully", gin.H{
		"transferred":       input.Amount,
		"receiver":          receiver.Email,
		"remaining_credits": sender.Credits - input.Amount,
	})
}



