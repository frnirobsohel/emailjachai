package service

import (
	"errors"
	"fmt"
	"strings"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/safe"

	"gorm.io/gorm"
)

type ResellerService interface {
	TransferCredits(resellerID uint, recipientEmail string, amount int) error
}

type resellerService struct {
	userRepo     repo.UserRepo
	txRepo       repo.TransactionRepo
	settingsRepo repo.SettingsRepo
}

func NewResellerService(userRepo repo.UserRepo, txRepo repo.TransactionRepo, settingsRepo repo.SettingsRepo) ResellerService {
	return &resellerService{
		userRepo:     userRepo,
		txRepo:       txRepo,
		settingsRepo: settingsRepo,
	}
}

func (s *resellerService) TransferCredits(resellerID uint, recipientEmail string, amount int) error {
	if amount <= 0 {
		return errors.New("transfer amount must be greater than zero")
	}

	recipientEmail = strings.ToLower(strings.TrimSpace(recipientEmail))

	err := s.txRepo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. Get Recipient first to verify role and ID without locking
		var recipient model.User
		if err := tx.Where("email = ?", recipientEmail).First(&recipient).Error; err != nil {
			return errors.New("recipient user not found")
		}

		if recipient.ID == resellerID {
			return errors.New("you cannot transfer credits to yourself")
		}

		if recipient.Role != "user" {
			return errors.New("unauthorized: reseller can only transfer credits to regular users")
		}

		// 2. Lock rows in consistent numeric order of IDs to prevent circular locking deadlocks
		firstID, secondID := resellerID, recipient.ID
		if resellerID > recipient.ID {
			firstID, secondID = recipient.ID, resellerID
		}

		var firstUser, secondUser model.User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&firstUser, firstID).Error; err != nil {
			return err
		}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&secondUser, secondID).Error; err != nil {
			return err
		}

		var reseller, targetRecipient model.User
		if firstID == resellerID {
			reseller = firstUser
			targetRecipient = secondUser
		} else {
			reseller = secondUser
			targetRecipient = firstUser
		}

		if reseller.Role != "reseller" && reseller.Role != "admin" {
			return errors.New("unauthorized: only resellers can transfer credits")
		}

		if reseller.Credits < amount {
			return errors.New("insufficient credits for transfer")
		}

		// 3. Deduct from Reseller
		if err := tx.Model(&reseller).Update("credits", gorm.Expr("credits - ?", amount)).Error; err != nil {
			return err
		}

		// 4. Add to Recipient
		if err := tx.Model(&targetRecipient).Update("credits", gorm.Expr("credits + ?", amount)).Error; err != nil {
			return err
		}

		// 5. Log Transactions (Legacy Parity)
		// Outbound (Reseller)
		txOut := &model.Transaction{
			UserID:        resellerID,
			TransactionID: "TRF_OUT_" + helper.GenerateRandomHex(10),
			Amount:        0,
			CreditsAdded:  -amount,
			Type:          "transfer_out",
			Status:        "completed",
			Provider:      "system",
			Description:   fmt.Sprintf("Transferred %d credits to %s", amount, recipientEmail),
		}
		if err := tx.Create(txOut).Error; err != nil {
			return err
		}

		// Inbound (Recipient)
		txIn := &model.Transaction{
			UserID:        targetRecipient.ID,
			TransactionID: "TRF_IN_" + helper.GenerateRandomHex(10),
			Amount:        0,
			CreditsAdded:  amount,
			Type:          "transfer_in",
			Status:        "completed",
			Provider:      "system",
			Description:   fmt.Sprintf("Received %d credits from %s", amount, reseller.Email),
		}
		if err := tx.Create(txIn).Error; err != nil {
			return err
		}

		return nil
	})

	if err == nil {
		// Broadcast updated credit balance for reseller (sender) and refresh stats
		safe.Go(func() {
			if updatedReseller, getErr := s.userRepo.GetByID(resellerID); getErr == nil && updatedReseller != nil {
				ws.GlobalHub.BroadcastToUser(updatedReseller.ID, "user_update", map[string]interface{}{
					"credits": updatedReseller.Credits,
				})
			}
			InvalidateAndRefreshDashboardStats(resellerID)
		})

		// Broadcast updated credit balance for recipient and refresh stats
		safe.Go(func() {
			if recipient, getErr := s.userRepo.GetByEmail(recipientEmail); getErr == nil && recipient != nil {
				ws.GlobalHub.BroadcastToUser(recipient.ID, "user_update", map[string]interface{}{
					"credits": recipient.Credits,
				})
				InvalidateAndRefreshDashboardStats(recipient.ID)
			}
		})
	}

	return err
}
