package model

import (
	"time"

	"gorm.io/gorm"
)

type PublicVerifyLog struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Email     string         `gorm:"type:varchar(255);not null" json:"email"`
	IP        string         `gorm:"type:varchar(45);not null;index" json:"ip"`
	CookieID  string         `gorm:"type:varchar(100);not null;index" json:"cookie_id"`
	Browser   string         `gorm:"type:varchar(255)" json:"browser"`
	Status    string         `gorm:"type:varchar(50);not null" json:"status"` // valid, invalid, blocked
	CreatedAt time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (PublicVerifyLog) TableName() string {
	return "public_verify_logs"
}
