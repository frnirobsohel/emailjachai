package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type ServerRepo interface {
	Create(server *model.WorkerServer) error
	List() ([]model.WorkerServer, error)
	GetByID(id uint) (*model.WorkerServer, error)
	Update(server *model.WorkerServer) error
	Delete(id uint) error
}

type serverRepo struct {
	db *gorm.DB
}

func NewServerRepo() ServerRepo {
	return &serverRepo{db: config.DB}
}

func (r *serverRepo) Create(server *model.WorkerServer) error {
	return r.db.Create(server).Error
}

func (r *serverRepo) List() ([]model.WorkerServer, error) {
	var servers []model.WorkerServer
	err := r.db.Order("id asc").Find(&servers).Error
	return servers, err
}

func (r *serverRepo) GetByID(id uint) (*model.WorkerServer, error) {
	var server model.WorkerServer
	if err := r.db.First(&server, id).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *serverRepo) Update(server *model.WorkerServer) error {
	return r.db.Save(server).Error
}

func (r *serverRepo) Delete(id uint) error {
	return r.db.Delete(&model.WorkerServer{}, id).Error
}
