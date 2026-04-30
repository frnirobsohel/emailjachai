package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

type LogService interface {
	GetLogs(limit, offset int) ([]model.ActivityLog, int64, error)
	ClearLogs() error
}

type logService struct {
	repo repo.LogRepo
}

func NewLogService(repo repo.LogRepo) LogService {
	return &logService{repo: repo}
}

func (s *logService) GetLogs(limit, offset int) ([]model.ActivityLog, int64, error) {
	return s.repo.List(limit, offset)
}

func (s *logService) ClearLogs() error {
	return s.repo.Clear()
}
