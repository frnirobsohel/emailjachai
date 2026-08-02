package model

import (
	"time"
)

type ActivityLog struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	UserID     *uint     `gorm:"column:user_id;index" json:"user_id"`
	Level      string    `gorm:"type:varchar(20);default:'INFO'" json:"level"`   // INFO, WARN, ERROR
	Source     string    `gorm:"type:varchar(50);default:'System'" json:"source"` // Admin, Worker, Auth, etc.
	Event      string    `gorm:"type:varchar(255)" json:"event"`
	Message    string    `gorm:"type:text" json:"message"`
	IP         string    `gorm:"type:varchar(45)" json:"ip"`
	Identifier string    `gorm:"type:varchar(255)" json:"identifier"`
	CreatedAt  time.Time `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`

	// Join / display fields
	UserName string `gorm:"-" json:"user_name,omitempty"`
	Time     string `gorm:"-" json:"time,omitempty"`
}

func (ActivityLog) TableName() string {
	return "activity_logs"
}
