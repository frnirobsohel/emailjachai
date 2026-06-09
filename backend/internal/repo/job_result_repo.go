package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type JobResultRepo interface {
	Create(result *model.JobResult) error
	GetByJobID(jobID uint) ([]model.JobResult, error)
	DeleteByJobID(jobID uint) error
	CreateInBatches(results []model.JobResult, batchSize int) error
}

type jobResultRepo struct {
	db *gorm.DB
}

func NewJobResultRepo() JobResultRepo {
	return &jobResultRepo{db: config.DB}
}

func (r *jobResultRepo) Create(result *model.JobResult) error {
	return r.db.Create(result).Error
}

func (r *jobResultRepo) GetByJobID(jobID uint) ([]model.JobResult, error) {
	var results []model.JobResult
	err := r.db.Where("job_internal_id = ?", jobID).Find(&results).Error
	return results, err
}

func (r *jobResultRepo) DeleteByJobID(jobID uint) error {
	return r.db.Where("job_internal_id = ?", jobID).Delete(&model.JobResult{}).Error
}

func (r *jobResultRepo) CreateInBatches(results []model.JobResult, batchSize int) error {
	return r.db.CreateInBatches(&results, batchSize).Error
}
