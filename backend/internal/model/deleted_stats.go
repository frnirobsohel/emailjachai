package model

import (
	"time"
)

type DeletedJobStats struct {
	UserID             uint      `gorm:"primaryKey" json:"user_id"`
	TotalVerifications int64     `gorm:"default:0" json:"total_verifications"`
	TotalJobs          int64     `gorm:"default:0" json:"total_jobs"`
	Deliverable        int64     `gorm:"default:0" json:"deliverable"`
	Risky              int64     `gorm:"default:0" json:"risky"`
	Undeliverable      int64     `gorm:"default:0" json:"undeliverable"`
	CatchAll           int64     `gorm:"default:0" json:"catch_all"`
	Disposable         int64     `gorm:"default:0" json:"disposable"`
	InvalidSyntax      int64     `gorm:"default:0" json:"invalid_syntax"`
	RoleAccounts       int64     `gorm:"default:0" json:"role_accounts"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type DeletedJobDailyStats struct {
	UserID       uint      `gorm:"primaryKey" json:"user_id"`
	ActivityDate string    `gorm:"primaryKey;type:date" json:"activity_date"`
	Emails       int64     `gorm:"default:0" json:"emails"`
	Jobs         int64     `gorm:"default:0" json:"jobs"`
	UpdatedAt    time.Time `json:"updated_at"`
}



