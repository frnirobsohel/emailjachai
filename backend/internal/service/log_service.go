package service

import (
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

type LogListFilter struct {
	Limit           int
	Level           string
	Query           string
	BeforeCreatedAt *time.Time
	BeforeID        uint64
}

type ClearLogsResult struct {
	Deleted  int64 `json:"deleted"`
	Preserved bool `json:"auth_failures_preserved"`
}

type LogService interface {
	GetLogs(filter LogListFilter) ([]model.ActivityLog, int64, error)
	ClearLogs(adminID uint) (*model.ActivityLog, ClearLogsResult, error)
	PurgeExpired() (int64, error)
}

type logService struct {
	repo repo.LogRepo
}

func NewLogService(repo repo.LogRepo) LogService {
	return &logService{repo: repo}
}

func (s *logService) GetLogs(filter LogListFilter) ([]model.ActivityLog, int64, error) {
	return s.repo.List(repo.LogListParams{
		Limit:           filter.Limit,
		Level:           filter.Level,
		Query:           filter.Query,
		BeforeCreatedAt: filter.BeforeCreatedAt,
		BeforeID:        filter.BeforeID,
	})
}

func (s *logService) ClearLogs(adminID uint) (*model.ActivityLog, ClearLogsResult, error) {
	deleted, err := s.repo.ClearOperational()
	if err != nil {
		return nil, ClearLogsResult{}, err
	}

	logEntry := &model.ActivityLog{
		UserID:  &adminID,
		Level:   "WARN",
		Source:  "Admin",
		Event:   "Logs Cleared",
		Message: "Operational activity logs cleared (Auth login-failure records preserved)",
	}
	if createErr := s.repo.Create(logEntry); createErr != nil {
		return nil, ClearLogsResult{Deleted: deleted, Preserved: true}, createErr
	}

	return logEntry, ClearLogsResult{Deleted: deleted, Preserved: true}, nil
}

func (s *logService) PurgeExpired() (int64, error) {
	return s.repo.PurgeExpired(90, 7)
}
