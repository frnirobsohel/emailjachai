package model

import (
	"time"
)

type JobTask struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	JobID        string    `gorm:"column:job_id;type:varchar(50);not null" json:"job_id"`
	StartIndex   int       `gorm:"column:start_index;not null" json:"start_index"`
	EndIndex     int       `gorm:"column:end_index;not null" json:"end_index"`
	PushedCount  int       `gorm:"column:pushed_count;not null;default:0" json:"pushed_count"`
	Status       string    `gorm:"type:varchar(20);default:'queued'" json:"status"` // queued, processing, completed, failed
	WorkerServer string    `gorm:"column:worker_server;type:varchar(100)" json:"worker_server"`
	CreatedAt    time.Time `gorm:"column:created_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at;type:timestamp;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (JobTask) TableName() string {
	return "job_tasks"
}



