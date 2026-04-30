package model

import (
	"time"

	"gorm.io/gorm"
)

type Setting struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	SettingKey   string         `gorm:"column:setting_key;type:varchar(100);uniqueIndex;not null" json:"setting_key"`
	SettingValue string         `gorm:"column:setting_value;type:text" json:"setting_value"`
	CreatedAt    time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Setting) TableName() string {
	return "settings"
}



