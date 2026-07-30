package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"

	"gorm.io/gorm"
)

var (
	ErrTransferAmountInvalid   = errors.New("transfer amount must be greater than zero")
	ErrTransferRecipientMissing = errors.New("recipient user not found")
	ErrTransferSelf            = errors.New("you cannot transfer credits to yourself")
	ErrTransferRecipientRole   = errors.New("reseller can only transfer credits to regular users")
	ErrTransferUnauthorized    = errors.New("only resellers or admins can transfer credits")
	ErrTransferInsufficient    = errors.New("insufficient credits for transfer")
	ErrTransferRecipientStatus = errors.New("cannot transfer credits to a suspended or inactive account")
	ErrTransferIdempotencyBusy = errors.New("a transfer with this idempotency key is already in progress")
)

type TransferResult struct {
	RemainingCredits int  `json:"remaining_credits"`
	AlreadyProcessed bool `json:"already_processed"`
}

type ResellerService interface {
	TransferCredits(resellerID uint, recipientEmail string, amount int, idempotencyKey string) (*TransferResult, error)
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

func (s *resellerService) TransferCredits(resellerID uint, recipientEmail string, amount int, idempotencyKey string) (*TransferResult, error) {
	if amount <= 0 {
		return nil, ErrTransferAmountInvalid
	}

	recipientEmail = strings.ToLower(strings.TrimSpace(recipientEmail))
	idempotencyKey = strings.TrimSpace(idempotencyKey)

	var lockReleased bool
	var redisKey string
	if idempotencyKey != "" && config.Redis != nil {
		redisKey = fmt.Sprintf("idempotency:transfer:%d:%s", resellerID, idempotencyKey)
		success, err := config.Redis.SetNX(config.Ctx, redisKey, "in_progress", 90*time.Second).Result()
		if err != nil {
			logger.Warn("Redis error during transfer idempotency check", "error", err)
		} else if !success {
			val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
			if val == "in_progress" {
				return nil, ErrTransferIdempotencyBusy
			}
			if strings.HasPrefix(val, "done:") {
				remaining := 0
				if updated, getErr := s.userRepo.GetByID(resellerID); getErr == nil && updated != nil {
					remaining = updated.Credits
				}
				return &TransferResult{RemainingCredits: remaining, AlreadyProcessed: true}, nil
			}
			return nil, ErrTransferIdempotencyBusy
		}
		defer func() {
			if !lockReleased && redisKey != "" {
				val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
				if val == "in_progress" {
					config.Redis.Del(config.Ctx, redisKey)
				}
			}
		}()
	}

	var remainingCredits int
	err := s.txRepo.DB().Transaction(func(tx *gorm.DB) error {
		var recipient model.User
		if err := tx.Where("email = ?", recipientEmail).First(&recipient).Error; err != nil {
			return ErrTransferRecipientMissing
		}

		if recipient.ID == resellerID {
			return ErrTransferSelf
		}

		if recipient.Role != "user" {
			return ErrTransferRecipientRole
		}

		status := strings.ToLower(strings.TrimSpace(recipient.Status))
		if status == "suspended" || status == "inactive" {
			return ErrTransferRecipientStatus
		}

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
			return ErrTransferUnauthorized
		}

		deduct := tx.Model(&model.User{}).
			Where("id = ? AND credits >= ?", reseller.ID, amount).
			Update("credits", gorm.Expr("credits - ?", amount))
		if deduct.Error != nil {
			return deduct.Error
		}
		if deduct.RowsAffected == 0 {
			return ErrTransferInsufficient
		}

		if err := tx.Model(&targetRecipient).Update("credits", gorm.Expr("credits + ?", amount)).Error; err != nil {
			return err
		}

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

		remainingCredits = reseller.Credits - amount
		return nil
	})

	if err != nil {
		return nil, err
	}

	if redisKey != "" && config.Redis != nil {
		if setErr := config.Redis.Set(config.Ctx, redisKey, fmt.Sprintf("done:%d", remainingCredits), 24*time.Hour).Err(); setErr != nil {
			logger.Warn("Failed to persist transfer idempotency key", "error", setErr)
		} else {
			lockReleased = true
		}
	}

	safe.Go(func() {
		if updatedReseller, getErr := s.userRepo.GetByID(resellerID); getErr == nil && updatedReseller != nil {
			ws.GlobalHub.BroadcastToUser(updatedReseller.ID, "user_update", map[string]interface{}{
				"credits": updatedReseller.Credits,
			})
		}
		InvalidateAndRefreshDashboardStats(resellerID)
	})

	safe.Go(func() {
		if recipient, getErr := s.userRepo.GetByEmail(recipientEmail); getErr == nil && recipient != nil {
			ws.GlobalHub.BroadcastToUser(recipient.ID, "user_update", map[string]interface{}{
				"credits": recipient.Credits,
			})
			InvalidateAndRefreshDashboardStats(recipient.ID)
		}
	})

	return &TransferResult{RemainingCredits: remainingCredits, AlreadyProcessed: false}, nil
}
