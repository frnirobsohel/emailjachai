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
	
	err := r.db.Order("created_at desc").Limit(limit).Offset(offset).Find(&logs).Error
	return logs, total, err
}

func (r *logRepo) Clear() error {
	return r.db.Exec("DELETE FROM activity_logs").Error
}
