package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type TransactionRepo interface {
	Create(tx *model.Transaction) error
	GetByID(id uint) (*model.Transaction, error)
	GetByExternalID(extID string) (*model.Transaction, error)
	Update(tx *model.Transaction) error
	List(userID uint, limit, offset int) ([]model.Transaction, error)
	Count(userID uint) (int64, error)
	GetUserSummary(userID uint) (purchased int64, refunds int64, err error)
}

type transactionRepo struct {
	db *gorm.DB
}

func NewTransactionRepo() TransactionRepo {
	return &transactionRepo{db: config.DB}
}

func (r *transactionRepo) Create(tx *model.Transaction) error {
	return r.db.Create(tx).Error
}

func (r *transactionRepo) GetByID(id uint) (*model.Transaction, error) {
	var tx model.Transaction
	if err := r.db.First(&tx, id).Error; err != nil {
		return nil, err
	}
	return &tx, nil
}

func (r *transactionRepo) GetByExternalID(extID string) (*model.Transaction, error) {
	var tx model.Transaction
	if err := r.db.Where("external_id = ?", extID).First(&tx).Error; err != nil {
		return nil, err
	}
	return &tx, nil
}

func (r *transactionRepo) Update(tx *model.Transaction) error {
	return r.db.Save(tx).Error
}

func (r *transactionRepo) List(userID uint, limit, offset int) ([]model.Transaction, error) {
	var txs []model.Transaction
	query := r.db.Where("user_id = ?", userID).Order("id DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}
	err := query.Find(&txs).Error
	return txs, err
}

func (r *transactionRepo) Count(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&model.Transaction{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

func (r *transactionRepo) GetUserSummary(userID uint) (int64, int64, error) {
	var summary struct {
		TotalPurchased int64
		TotalRefunds   int64
	}
	err := r.db.Model(&model.Transaction{}).
		Select("SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN credits_added ELSE 0 END) as total_purchased, ABS(SUM(CASE WHEN type = 'refund' AND status = 'completed' THEN credits_added ELSE 0 END)) as total_refunds").
		Where("user_id = ?", userID).
		Scan(&summary).Error
	return summary.TotalPurchased, summary.TotalRefunds, err
}
