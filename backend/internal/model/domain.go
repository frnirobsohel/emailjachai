package model

import (
	"time"

	"gorm.io/gorm"
)

type Domain struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Domain    string         `gorm:"column:domain;type:varchar(255);uniqueIndex;not null" json:"domain"`
	Type      string         `gorm:"type:varchar(50);not null;default:'disposable'" json:"type"` // disposable, free, blacklist, spam-trap
	Excluded  bool           `gorm:"column:excluded;not null;default:false" json:"excluded"`
	AddedBy   *uint          `gorm:"column:added_by;index" json:"added_by"`
	CreatedAt time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt time.Time      `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	User *User `gorm:"foreignKey:AddedBy" json:"-"`
}

func (Domain) TableName() string {
	return "domains"
}



