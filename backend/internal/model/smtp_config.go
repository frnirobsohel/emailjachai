package model

import (
	"time"
)

type SmtpConfig struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Host       string    `gorm:"type:varchar(255)" json:"host"`
	Port       int       `gorm:"default:587" json:"port"`
	Username   string    `gorm:"type:varchar(255)" json:"username"`
	Password   string    `gorm:"type:text" json:"-"`
	Encryption string    `gorm:"type:varchar(10);default:'tls'" json:"encryption"` // none, ssl, tls
	DailyLimit int       `gorm:"column:daily_limit;default:5000" json:"daily_limit"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

func (SmtpConfig) TableName() string {
	return "smtp_configs"
}




