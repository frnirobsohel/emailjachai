package model

import (
	"time"

	"gorm.io/gorm"
)

type EmailTemplate struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	TemplateName string         `gorm:"type:varchar(100);uniqueIndex;not null" json:"template_name"`
	Subject      string         `gorm:"type:varchar(255)" json:"subject"`
	Body         string         `gorm:"type:text" json:"body"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}



