package repo

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"fmt"
	"time"

	"gorm.io/gorm"
)


type UserRepo interface {
	GetByID(id uint) (*model.User, error)
	GetByEmail(email string) (*model.User, error)
	Create(user *model.User) error
	Update(user *model.User, updates map[string]interface{}) error
	GetAll() ([]model.User, error)
	Delete(id uint) error
	AddCredits(userID uint, credits int, txnType string, description string, provider string) error
	CountUsers(from, to *time.Time) (int64, error)
	GetRecentUsers(limit int) ([]model.User, error)
	AdjustCredits(userID uint, amount int, amountPaid float64, desc string) error
}
type userRepo struct {
	db *gorm.DB
}

func NewUserRepo() UserRepo {
	return &userRepo{db: config.DB}
}

func (r *userRepo) GetByID(id uint) (*model.User, error) {
	var user model.User
	if err := r.db.First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepo) GetByEmail(email string) (*model.User, error) {
	var user model.User
	if err := r.db.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepo) Create(user *model.User) error {
	return r.db.Create(user).Error
}

func (r *userRepo) Update(user *model.User, updates map[string]interface{}) error {
	return r.db.Model(user).Updates(updates).Error
}

func (r *userRepo) GetAll() ([]model.User, error) {
	var users []model.User
	err := r.db.Order("created_at DESC").Find(&users).Error
	return users, err
}

func (r *userRepo) Delete(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		tx.Exec("DELETE FROM api_keys WHERE user_id = ?", id)
		tx.Exec("DELETE FROM transactions WHERE user_id = ?", id)
		tx.Exec("DELETE FROM job_results WHERE job_internal_id IN (SELECT id FROM jobs WHERE user_id = ?)", id)
		tx.Exec("DELETE FROM job_tasks WHERE job_id IN (SELECT job_id FROM jobs WHERE user_id = ?)", id)
		tx.Exec("DELETE FROM jobs WHERE user_id = ?", id)
		
		// Hard delete the user so their email can be reused
		return tx.Exec("DELETE FROM users WHERE id = ?", id).Error
	})
}

func (r *userRepo) AddCredits(userID uint, credits int, txnType string, description string, provider string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Update user credits
		if err := tx.Model(&model.User{}).Where("id = ?", userID).Update("credits", gorm.Expr("credits + ?", credits)).Error; err != nil {
			return err
		}

		// 2. Log transaction
		txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(6))
		transaction := &model.Transaction{
			UserID:        userID,
			TransactionID: txnID,
			Amount:        0, // In real scenario, add actual currency amount
			CreditsAdded:  credits,
			Type:          txnType,
			Status:        "completed",
			Description:   description,
			Provider:      provider,
		}
		return tx.Create(transaction).Error
	})
}

func (r *userRepo) CountUsers(from, to *time.Time) (int64, error) {
	var count int64
	query := r.db.Model(&model.User{})
	if from != nil {
		query = query.Where("created_at >= ?", *from)
	}
	if to != nil {
		query = query.Where("created_at < ?", *to)
	}
	err := query.Count(&count).Error
	return count, err
}

func (r *userRepo) GetRecentUsers(limit int) ([]model.User, error) {
	var users []model.User
	err := r.db.Order("id DESC").Limit(limit).Find(&users).Error
	return users, err
}

func (r *userRepo) AdjustCredits(userID uint, amount int, amountPaid float64, desc string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.Set("gorm:query_option", "FOR UPDATE").First(&user, userID).Error; err != nil {
			return err
		}

		newCredits := user.Credits + amount
		if newCredits < 0 {
			newCredits = 0
		}

		if err := tx.Model(&user).Update("credits", newCredits).Error; err != nil {
			return err
		}

		txnType := "adjustment"
		txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
		transaction := &model.Transaction{
			UserID:        userID,
			TransactionID: txnID,
			Amount:        amountPaid,
			CreditsAdded:  amount,
			Type:          txnType,
			Status:        "completed",
			Description:   desc,
			Provider:      "system",
		}
		return tx.Create(transaction).Error
	})
}
