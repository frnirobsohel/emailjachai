package model

import (
	"time"

	"gorm.io/gorm"
)

type BlockedClient struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Value     string         `gorm:"type:varchar(100);not null;index" json:"value"` // The IP address or Cookie ID
	Type      string         `gorm:"type:varchar(20);not null" json:"type"`         // "ip" or "cookie"
	BlockType string         `gorm:"type:varchar(20);not null" json:"block_type"`   // "soft" or "hard"
	Reason    string         `gorm:"type:varchar(255)" json:"reason"`               // Reason for blocking
	BlockedAt time.Time      `gorm:"column:blocked_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"blocked_at"`
	CreatedAt time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BlockedClient) TableName() string {
	return "blocked_clients"
}
