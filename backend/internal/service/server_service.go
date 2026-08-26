package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/logger"
)

type ServerService interface {
	ListServers() ([]model.WorkerServer, error)
	GetActiveTasksCountByWorker() ([]repo.WorkerTaskSummary, error)
	GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error)
	RotateWorkerKey() (newKey, maskedKey string, err error)
	CheckAdminPassword(adminID uint, password string) (bool, error)
	GetByName(name string) (*model.WorkerServer, error)
	CreateServer(server *model.WorkerServer) error
	GetByID(id uint) (*model.WorkerServer, error)
	UpdateFields(id uint, updates map[string]interface{}) error
	ToggleServer(id uint, enabled bool) error
	DeleteServer(id uint) error
}

type serverService struct {
	repo repo.ServerRepo
}

func NewServerService(repo repo.ServerRepo) ServerService {
	return &serverService{repo: repo}
}

func (s *serverService) ListServers() ([]model.WorkerServer, error) {
	return s.repo.List()
}

func (s *serverService) GetActiveTasksCountByWorker() ([]repo.WorkerTaskSummary, error) {
	return s.repo.GetActiveTasksCountByWorker()
}

func (s *serverService) GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error) {
	return s.repo.GetOrProvisionWorkerKey()
}

func (s *serverService) RotateWorkerKey() (newKey, maskedKey string, err error) {
	return s.repo.RotateWorkerKey()
}

func (s *serverService) CheckAdminPassword(adminID uint, password string) (bool, error) {
	return s.repo.CheckAdminPassword(adminID, password)
}

func (s *serverService) GetByName(name string) (*model.WorkerServer, error) {
	return s.repo.GetByName(name)
}

func (s *serverService) CreateServer(server *model.WorkerServer) error {
	return s.repo.Create(server)
}

func (s *serverService) GetByID(id uint) (*model.WorkerServer, error) {
	return s.repo.GetByID(id)
}

func (s *serverService) UpdateFields(id uint, updates map[string]interface{}) error {
	return s.repo.UpdateFields(id, updates)
}

func (s *serverService) ToggleServer(id uint, enabled bool) error {
	server, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	if err := s.repo.UpdateFields(id, map[string]interface{}{"enabled": enabled}); err != nil {
		return err
	}
	// Disable: release in-flight ownership so enabled peers can finish chunks.
	if !enabled {
		n, rerr := s.repo.ReclaimProcessingTasks(server.ServerName)
		if rerr != nil {
			logger.Error("Failed to reclaim tasks on worker disable", "server", server.ServerName, "error", rerr)
			return rerr
		}
		if n > 0 {
			logger.Info("Reclaimed processing tasks after disable", "server", server.ServerName, "tasks", n)
		}
	}
	return nil
}

func (s *serverService) DeleteServer(id uint) error {
	return s.repo.Delete(id)
}
