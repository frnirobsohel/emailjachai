package service

import (
	"ejp-backend/internal/repo"
)

type WorkerService interface {
	ClaimTask(workerID string) (interface{}, error)
	CompleteTask(taskID string, result interface{}) error
}

type workerService struct {
	jobRepo repo.JobRepository
	serverRepo repo.ServerRepo
}

func NewWorkerService(jobRepo repo.JobRepository, serverRepo repo.ServerRepo) WorkerService {
	return &workerService{
		jobRepo: jobRepo,
		serverRepo: serverRepo,
	}
}

func (s *workerService) ClaimTask(workerID string) (interface{}, error) {
	return nil, nil
}

func (s *workerService) CompleteTask(taskID string, result interface{}) error {
	return nil
}
