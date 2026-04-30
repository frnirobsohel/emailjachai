package model

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"type:varchar(255);not null" json:"name"`
	Email     string         `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	Password  string         `gorm:"type:varchar(255);not null" json:"-"`
	Role      string         `gorm:"type:varchar(20);default:'user'" json:"role"` // admin, manager, reseller, user, demo
	Credits   int            `gorm:"default:0" json:"credits"`
	Status        string         `gorm:"type:varchar(20);default:'Active'" json:"status"` // Active, Suspended
	WebhookURL    string         `gorm:"type:varchar(255)" json:"webhook_url"`
	WebhookSecret string         `gorm:"type:varchar(255)" json:"webhook_secret"`
	CreatedAt     time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

func (User) TableName() string {
	return "users"
}



