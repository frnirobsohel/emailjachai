package model

import (
	"time"

	"gorm.io/gorm"
)

type APIKey struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"column:user_id;not null" json:"user_id"`
	KeyPrefix  string         `gorm:"column:key_prefix;type:varchar(16);index" json:"key_prefix"`
	APIKey     string         `gorm:"column:api_key;type:varchar(255)" json:"api_key"`
	Key        string         `gorm:"column:key;type:varchar(255);uniqueIndex;not null" json:"key"`
	Name       string         `gorm:"type:varchar(100);default:'Default Key'" json:"name"`
	Status     string         `gorm:"type:varchar(20);default:'active'" json:"status"` // active, revoked, expired
	LastUsedAt *time.Time     `gorm:"column:last_used_at" json:"last_used_at"`
	ExpiresAt  *time.Time     `gorm:"column:expires_at" json:"expires_at"`
	CreatedAt  time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"-"`
}

func (APIKey) TableName() string {
	return "api_keys"
}



