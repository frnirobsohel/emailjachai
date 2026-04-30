package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type JobRepository interface {
	Create(job *model.Job) error
	GetByID(jobID string) (*model.Job, error)
	GetByInternalID(id uint) (*model.Job, error)
	Update(job *model.Job) error
	List(userID uint, jobType string, limit int, offset int) ([]model.Job, error)
	Delete(jobID string, userID uint) error
	GetStats(userID uint) (map[string]interface{}, error)
}

type jobRepository struct {
	db *gorm.DB
}

func NewJobRepository() JobRepository {
	return &jobRepository{db: config.DB}
}

func (r *jobRepository) Create(job *model.Job) error {
	return r.db.Create(job).Error
}

func (r *jobRepository) GetByID(jobID string) (*model.Job, error) {
	var job model.Job
	if err := r.db.Where("job_id = ?", jobID).First(&job).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepository) GetByInternalID(id uint) (*model.Job, error) {
	var job model.Job
	if err := r.db.First(&job, id).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepository) Update(job *model.Job) error {
	return r.db.Save(job).Error
}

func (r *jobRepository) List(userID uint, jobType string, limit int, offset int) ([]model.Job, error) {
	var jobs []model.Job
	query := r.db.Where("user_id = ?", userID).Order("created_at desc")
	
	if jobType != "" && jobType != "all" {
		query = query.Where("type = ?", jobType)
	}

	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}
	err := query.Find(&jobs).Error
	return jobs, err
}

func (r *jobRepository) Delete(jobID string, userID uint) error {
	return r.db.Where("job_id = ? AND user_id = ?", jobID, userID).Delete(&model.Job{}).Error
}

func (r *jobRepository) GetStats(userID uint) (map[string]interface{}, error) {
	var stats struct {
		TotalJobs          int64 `json:"total_jobs"`
		TotalVerifications int64 `json:"total_verifications"`
	}
	
	err := r.db.Model(&model.Job{}).Where("user_id = ?", userID).Select("COUNT(*) as total_jobs, SUM(total_emails) as total_verifications").Scan(&stats).Error
	
	return map[string]interface{}{
		"total_jobs":          stats.TotalJobs,
		"total_verifications": stats.TotalVerifications,
	}, err
}
