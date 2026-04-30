package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

type ServerService interface {
	ListServers() ([]model.WorkerServer, error)
	AddServer(name, ip string) error
	ToggleServer(id uint) error
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

func (s *serverService) AddServer(name, ip string) error {
	server := &model.WorkerServer{
		ServerName: name,
		IPAddress:  ip,
		Status:     "offline",
		Enabled:    true,
	}
	return s.repo.Create(server)
}

func (s *serverService) ToggleServer(id uint) error {
	server, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	
	server.Enabled = !server.Enabled
	
	return s.repo.Update(server)
}

func (s *serverService) DeleteServer(id uint) error {
	return s.repo.Delete(id)
}
