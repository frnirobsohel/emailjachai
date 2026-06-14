package model

import (
	"time"
)

type EmailCache struct {
	Email          string    `gorm:"primaryKey;type:varchar(255)" json:"email"`
	Status         string    `gorm:"type:varchar(50);index;not null" json:"status"`
	Score          int       `gorm:"default:0" json:"score"`
	Reason         string    `gorm:"type:varchar(100)" json:"reason"`
	
	// Technical Details
	IsDisposable    bool    `gorm:"default:false" json:"is_disposable"`
	IsFree          bool    `gorm:"default:false" json:"is_free"`
	IsRole          bool    `gorm:"default:false" json:"is_role"`
	HasMx           bool    `gorm:"default:false" json:"has_mx"`
	MxRecords       []string `gorm:"serializer:json;type:text" json:"mx_records,omitempty"`
	SmtpConnect     bool    `gorm:"default:false" json:"smtp_connect"`
	UserExists      bool    `gorm:"default:false" json:"user_exists"`
	IsCatchAll      bool    `gorm:"default:false" json:"is_catch_all"`
	IsDeliverable   bool    `gorm:"default:false" json:"is_deliverable"`
	IsSyntaxValid   bool    `gorm:"default:false" json:"is_syntax_valid"`
	IsSpamTrap      bool    `gorm:"default:false" json:"is_spam_trap"`
	IsBlacklisted   bool    `gorm:"default:false" json:"is_blacklisted"`
	MailboxFull     bool    `gorm:"default:false" json:"mailbox_full"`
	ProcessingTime  float64 `gorm:"type:decimal(10,3)" json:"processing_time"`

	CreatedAt time.Time `gorm:"index" json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
