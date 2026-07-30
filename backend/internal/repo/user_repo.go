package repo

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)


type UserRepo interface {
	GetByID(id uint) (*model.User, error)
	GetByEmail(email string) (*model.User, error)
	Create(user *model.User) error
	Update(user *model.User, updates map[string]interface{}) error
	GetAll() ([]model.User, error)
	ListUsers(q, role string, page, limit int) ([]model.User, int64, error)
	CountByStatus(status string) (int64, error)
	CountPaidUsers() (int64, error)
	LatestPackageByUserIDs(userIDs []uint) (map[uint]string, error)
	PaidUserIDSet(userIDs []uint) (map[uint]bool, error)
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

func (r *userRepo) ListUsers(q, role string, page, limit int) ([]model.User, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}

	query := r.db.Model(&model.User{})
	q = strings.TrimSpace(q)
	if q != "" {
		like := "%" + q + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ?", like, like)
	}
	role = strings.TrimSpace(role)
	if role != "" && role != "all" {
		query = query.Where("role = ?", role)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	offset := (page - 1) * limit
	err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&users).Error
	return users, total, err
}

func (r *userRepo) CountByStatus(status string) (int64, error) {
	var count int64
	err := r.db.Model(&model.User{}).Where("LOWER(status) = ?", strings.ToLower(status)).Count(&count).Error
	return count, err
}

func (r *userRepo) CountPaidUsers() (int64, error) {
	var count int64
	err := r.db.Model(&model.User{}).
		Where("id IN (?)",
			r.db.Model(&model.Transaction{}).
				Select("DISTINCT user_id").
				Where("status = ? AND type = ? AND credits_added > 0", "completed", "purchase"),
		).Count(&count).Error
	return count, err
}

func (r *userRepo) LatestPackageByUserIDs(userIDs []uint) (map[uint]string, error) {
	out := make(map[uint]string, len(userIDs))
	if len(userIDs) == 0 {
		return out, nil
	}
	type row struct {
		UserID  uint
		Package string
	}
	var rows []row
	// Postgres DISTINCT ON — newest non-empty package per user
	err := r.db.Raw(`
		SELECT DISTINCT ON (user_id) user_id, package
		FROM transactions
		WHERE user_id IN ? AND status = 'completed' AND package IS NOT NULL AND package <> ''
		ORDER BY user_id, id DESC
	`, userIDs).Scan(&rows).Error
	if err != nil {
		return out, err
	}
	for _, rw := range rows {
		out[rw.UserID] = rw.Package
	}
	return out, nil
}

func (r *userRepo) PaidUserIDSet(userIDs []uint) (map[uint]bool, error) {
	out := make(map[uint]bool, len(userIDs))
	if len(userIDs) == 0 {
		return out, nil
	}
	var ids []uint
	err := r.db.Model(&model.Transaction{}).
		Where("user_id IN ? AND status = ? AND type = ? AND credits_added > 0", userIDs, "completed", "purchase").
		Distinct("user_id").
		Pluck("user_id", &ids).Error
	if err != nil {
		return out, err
	}
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

func (r *userRepo) Delete(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var user model.User
		if err := tx.First(&user, id).Error; err != nil {
			return err
		}

		// Revoke access immediately; keep jobs/transactions for audit & revenue history.
		if err := tx.Where("user_id = ?", id).Delete(&model.APIKey{}).Error; err != nil {
			return err
		}

		// Free the email for future re-registration while retaining the soft-deleted row.
		tombstoneEmail := fmt.Sprintf("%s.deleted.%d", user.Email, user.ID)
		if err := tx.Model(&user).Updates(map[string]interface{}{
			"email":  tombstoneEmail,
			"status": "Suspended",
		}).Error; err != nil {
			return err
		}

		if err := tx.Delete(&user).Error; err != nil {
			return err
		}
		return nil
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
		if amount > 0 && amountPaid > 0 {
			txnType = "purchase"
		}
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
