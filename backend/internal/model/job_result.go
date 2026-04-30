package model

import (
	"time"

	"gorm.io/gorm"
)

type JobResult struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	JobInternalID uint           `gorm:"index:idx_job_status" json:"job_id"`
	Email     string         `gorm:"type:varchar(255);not null" json:"email"`
	Status    string         `gorm:"type:varchar(50);index:idx_job_status;not null" json:"status"` // valid, invalid, catch_all, unknown
	Score     int            `gorm:"default:0" json:"score"`
	Reason    string         `gorm:"type:varchar(100)" json:"reason"` // syntax, mx, smtp, etc.
	
	// Technical Details
	IsDisposable    bool    `gorm:"default:false" json:"is_disposable"`
	IsFree          bool    `gorm:"default:false" json:"is_free"`
	IsRole          bool    `gorm:"default:false" json:"is_role"`
	HasMx           bool    `gorm:"default:false" json:"has_mx"`
	SmtpConnect     bool    `gorm:"default:false" json:"smtp_connect"`
	UserExists      bool    `gorm:"default:false" json:"user_exists"`
	IsCatchAll      bool    `gorm:"default:false" json:"is_catch_all"`
	IsDeliverable   bool    `gorm:"default:false" json:"is_deliverable"`
	IsSyntaxValid   bool    `gorm:"default:false" json:"is_syntax_valid"`
	IsSpamTrap      bool    `gorm:"default:false" json:"is_spam_trap"`
	IsBlacklisted   bool    `gorm:"default:false" json:"is_blacklisted"`
	MailboxFull     bool    `gorm:"default:false" json:"mailbox_full"`
	ProcessingTime  float64 `gorm:"type:decimal(10,3)" json:"processing_time"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	Job Job `gorm:"foreignKey:JobInternalID;references:ID" json:"-"`
}



