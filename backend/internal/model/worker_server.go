package model

import (
	"time"
)

type WorkerServer struct {
	ID             uint       `gorm:"primaryKey" json:"id"`
	ServerName     string     `gorm:"column:server_name;type:varchar(100);uniqueIndex;not null" json:"server_name"`
	IPAddress      string     `gorm:"column:ip_address;type:varchar(45);not null" json:"ip_address"`
	Port           int        `gorm:"column:port;type:integer;not null;default:80" json:"port"`
	AuthToken      string     `gorm:"column:auth_token;type:varchar(255)" json:"auth_token"`
	IPReputation   string     `gorm:"column:ip_reputation;type:varchar(20);default:'Good'" json:"ip_reputation"`
	RateLimit      int        `gorm:"column:rate_limit;default:100" json:"rate_limit"`
	DailyLimit     int        `gorm:"column:daily_limit;default:50000" json:"daily_limit"`
	WorkerCount    int        `gorm:"column:worker_count;default:0" json:"worker_count"`
	EmailsVerified int        `gorm:"column:emails_verified;default:0" json:"emails_verified"`
	LastPing       *time.Time `gorm:"column:last_ping" json:"last_ping"`
	Status         string     `gorm:"type:varchar(20);default:'offline'" json:"status"` // online, offline, maintenance
	Enabled        bool       `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedAt      time.Time  `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
}

func (WorkerServer) TableName() string {
	return "worker_servers"
}



