package model

import (
	"time"
)

type Transaction struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"column:user_id;index;not null" json:"user_id"`
	TransactionID string    `gorm:"column:transaction_id;type:varchar(100);uniqueIndex;not null" json:"transaction_id"`
	ExternalID    string    `gorm:"column:external_id;type:varchar(255);index" json:"external_id,omitempty"`
	Amount        float64   `gorm:"column:amount;type:decimal(10,2);not null" json:"amount"`
	CreditsAdded  int       `gorm:"column:credits_added;not null" json:"credits_added"`
	PaymentMethod string    `gorm:"column:payment_method;type:varchar(100);default:'manual'" json:"payment_method"`
	Type          string    `gorm:"type:varchar(50);default:'purchase'" json:"type"` // purchase, usage, adjustment
	Status        string    `gorm:"type:varchar(20);default:'completed'" json:"status"` // completed, failed, pending, expired, cancelled
	Provider      string    `gorm:"type:varchar(50);default:'system'" json:"provider"`
	Package       string    `gorm:"column:package;type:varchar(100)" json:"package"`
	Description   string    `gorm:"type:text" json:"description"`
	CreatedAt     time.Time `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP;index" json:"created_at"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"-"`
}

func (Transaction) TableName() string {
	return "transactions"
}



