package model

import (
	"time"
)

type SecurityLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"column:user_id;index;not null" json:"user_id"`
	Severity  string    `gorm:"type:varchar(20);not null" json:"severity"`
	Module    string    `gorm:"type:varchar(50);not null" json:"module"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	CreatedAt time.Time `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
}

func (SecurityLog) TableName() string {
	return "security_logs"
}
