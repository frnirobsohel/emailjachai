package model

import (
	"time"

	"gorm.io/gorm"
)

type Package struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	Name          string         `gorm:"type:varchar(100)" json:"name"`
	Tagline       string         `gorm:"type:varchar(255)" json:"tagline"`
	CreditsAmount int            `gorm:"column:credits_amount;not null" json:"credits_amount"`
	Price         float64        `gorm:"type:decimal(10,2);not null" json:"price"`
	Description   string         `gorm:"type:text" json:"description"`
	Features      string         `gorm:"type:text" json:"features"` // JSON string of features
	Status        string         `gorm:"type:varchar(20);default:'active'" json:"status"`
	Popular       bool           `gorm:"default:false" json:"popular"`
	IsPublic      bool           `gorm:"default:true" json:"is_public"` // Controls frontend visibility
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}



