package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type LogRepo interface {
	Create(log *model.ActivityLog) error
	List(limit, offset int) ([]model.ActivityLog, int64, error)
	Clear() error
}

type logRepo struct {
	db *gorm.DB
}

func NewLogRepo() LogRepo {
	return &logRepo{db: config.DB}
}

func (r *logRepo) Create(log *model.ActivityLog) error {
	return r.db.Create(log).Error
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
