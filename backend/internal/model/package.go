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
	OfferPrice    float64        `gorm:"column:offer_price;type:decimal(10,2);not null;default:0" json:"offer_price"`
	Description   string         `gorm:"type:text" json:"description"`
	Features      string         `gorm:"type:text" json:"features"` // JSON string of features
	Status        string         `gorm:"type:varchar(20);default:'active'" json:"status"`
	Popular       bool           `gorm:"default:false" json:"popular"`
	IsPublic      bool           `gorm:"default:true" json:"is_public"` // Controls frontend visibility
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

// HasOffer reports a live discount: offer_price > 0 and strictly below regular price.
func (p Package) HasOffer() bool {
	return p.OfferPrice > 0 && p.OfferPrice < p.Price
}

// EffectivePrice is the amount charged at checkout.
func (p Package) EffectivePrice() float64 {
	if p.HasOffer() {
		return p.OfferPrice
	}
	return p.Price
}



