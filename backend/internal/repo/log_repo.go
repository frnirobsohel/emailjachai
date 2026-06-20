package repo

import (
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type LogRepo interface {
	Create(log *model.ActivityLog) error
	List(limit, offset int) ([]model.ActivityLog, int64, error)
	Clear() error
	CountFailedLogins(ip, email string, since time.Time) (int64, error)
	DB() *gorm.DB
}

type logRepo struct {
	db *gorm.DB
}

func NewLogRepo() LogRepo {
	return &logRepo{db: config.DB}
}

func (r *logRepo) DB() *gorm.DB {
	return r.db
}

func (r *logRepo) CountFailedLogins(ip, email string, since time.Time) (int64, error) {
	var failedCount int64
	err := r.db.Model(&model.ActivityLog{}).
		Where("source = 'Auth' AND event = 'Login Failed' AND (ip = ? OR identifier = ?) AND created_at >= ?", ip, email, since).
		Count(&failedCount).Error
	return failedCount, err
}

func (r *logRepo) Create(log *model.ActivityLog) error {
	err := r.db.Create(log).Error
	if err == nil && ws.GlobalHub != nil {
		ws.GlobalHub.BroadcastToAdmins("system_log_update", log)
	}
	return err
}

func (r *logRepo) List(limit, offset int) ([]model.ActivityLog, int64, error) {
	var logs []model.ActivityLog
	var total int64
	
	r.db.Model(&model.ActivityLog{}).Count(&total)
	
	err := r.db.Table("activity_logs").
		Select("activity_logs.*, users.name as user_name, activity_logs.created_at as time").
		Joins("LEFT JOIN users ON activity_logs.user_id = users.id").
		Order("activity_logs.created_at DESC").
		Limit(limit).
		Offset(offset).
		Scan(&logs).Error
	return logs, total, err
}

func (r *logRepo) Clear() error {
	return r.db.Exec("TRUNCATE TABLE activity_logs").Error
}
