package service

import (
	"errors"
	"fmt"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"

	"gorm.io/gorm"
)

type ResellerService interface {
	TransferCredits(resellerID uint, recipientEmail string, amount int) error
}

type resellerService struct {
	userRepo repo.UserRepo
	txRepo   repo.TransactionRepo
}

func NewResellerService(userRepo repo.UserRepo, txRepo repo.TransactionRepo) ResellerService {
	return &resellerService{
		userRepo: userRepo,
		txRepo:   txRepo,
	}
}

func (s *resellerService) TransferCredits(resellerID uint, recipientEmail string, amount int) error {
	if amount <= 0 {
		return errors.New("transfer amount must be greater than zero")
	}

	return s.txRepo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. Get Reseller (Sender)
		var reseller model.User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&reseller, resellerID).Error; err != nil {
			return errors.New("account not found")
		}

		if reseller.Role != "reseller" && reseller.Role != "admin" {
			return errors.New("unauthorized: only resellers can transfer credits")
		}

		if reseller.Credits < amount {
			return errors.New("insufficient credits for transfer")
		}

		// 2. Get Recipient
		var recipient model.User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("email = ?", recipientEmail).First(&recipient).Error; err != nil {
			return errors.New("recipient user not found")
		}

		if recipient.ID == resellerID {
			return errors.New("you cannot transfer credits to yourself")
		}

		// 3. Deduct from Reseller
		if err := tx.Model(&reseller).Update("credits", gorm.Expr("credits - ?", amount)).Error; err != nil {
			return err
		}

		// 4. Add to Recipient
		if err := tx.Model(&recipient).Update("credits", gorm.Expr("credits + ?", amount)).Error; err != nil {
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
			UserID:        recipient.ID,
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
}
