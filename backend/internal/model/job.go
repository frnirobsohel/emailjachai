package model

import (
	"time"

	"gorm.io/gorm"
)

type Job struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"column:user_id;index:idx_user_created,priority:1;index:idx_user_type,priority:1;not null" json:"user_id"`
	JobID          string         `gorm:"column:job_id;type:varchar(50);uniqueIndex;not null" json:"job_id"`
	Email          string         `gorm:"type:varchar(255)" json:"email"`
	Filename       string         `gorm:"type:varchar(255)" json:"filename"`
	FileURL        string         `gorm:"column:file_url;type:varchar(255)" json:"file_url"`
	ResultFilePath string         `gorm:"column:result_file_path;type:varchar(512)" json:"result_file_path,omitempty"` // ndjson storage path
	Status         string         `gorm:"type:varchar(20);default:'pending'" json:"status"`            // preparing, pending, processing, completed, failed
	JobType        string         `gorm:"column:type;type:varchar(20);default:'bulk';index:idx_user_type,priority:2" json:"job_type"` // bulk, single
	TotalEmails    int            `gorm:"column:total_emails;default:0" json:"total_emails"`
	ProcessedCount int            `gorm:"column:processed_count;default:0" json:"processed_count"`
	APIKeyID       *uint          `gorm:"column:api_key_id;index" json:"api_key_id,omitempty"`
	Deliverable    int            `gorm:"column:deliverable;default:0" json:"deliverable"`
	Risky          int            `gorm:"column:risky;default:0" json:"risky"`
	Undeliverable  int            `gorm:"column:undeliverable;default:0" json:"undeliverable"`
	CatchAll       int            `gorm:"column:catch_all;default:0" json:"catch_all"`
	InvalidSyntax  int            `gorm:"column:invalid_syntax;default:0" json:"invalid_syntax"`
	RoleAccounts   int            `gorm:"column:role_accounts;default:0" json:"role_accounts"`
	Disposable     int            `gorm:"column:disposable;default:0" json:"disposable"`
	VerifiedCount  int            `gorm:"column:verified_count;default:0" json:"verified_count"`
	CreatedAt      time.Time      `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP;index:idx_user_created,priority:2" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	User User `gorm:"foreignKey:UserID" json:"-"`
}

func (Job) TableName() string {
	return "jobs"
}



