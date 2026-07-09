package repo

import (
	"database/sql"
	"errors"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type JobRepository interface {
	Create(job *model.Job) error
	GetByID(jobID string) (*model.Job, error)
	GetByInternalID(id uint) (*model.Job, error)
	Update(job *model.Job) error
	List(userID uint, jobType string, limit int, offset int) ([]model.Job, int64, error)
	Delete(jobID string, userID uint) error
	GetStats(userID uint) (map[string]interface{}, error)
	CountActiveJobs(userID uint) (int64, error)
	CreateBulkJob(userID uint, jobID string, filename string, totalEmails int, invalidSyntaxCount int, queuedCount int, taskRecords []model.JobTask, apiKeyID *uint) (*model.Job, []model.JobTask, error)
	RefundBulkJob(userID uint, jobID string, refundCredits int, description string) error
	ClaimTask(serverName string, taskTimeoutMinutes int) (*model.JobTask, error)
	GetJobForUser(userID uint, jobID string) (*model.Job, error)
	GetJobResultsRows(jobInternalID uint) (*sql.Rows, error)
	CountAllActiveJobs() (int64, error)
	DB() *gorm.DB
	CheckAndApplyRiskyRefund(tx *gorm.DB, jobID string) error
}

type DownloadResultRow struct {
	Email        string
	Status       string
	Reason       string
	IsCatchAll   bool
	Score        int
	CreatedAt    time.Time
	MxRecordsRaw []byte
}

type jobRepository struct {
	db *gorm.DB
}

func NewJobRepository() JobRepository {
	return &jobRepository{db: config.DB}
}

func (r *jobRepository) DB() *gorm.DB {
	return r.db
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

func (r *jobRepository) List(userID uint, jobType string, limit int, offset int) ([]model.Job, int64, error) {
	var jobs []model.Job
	var total int64
	query := r.db.Model(&model.Job{}).Where("user_id = ?", userID)
	
	if jobType != "" && jobType != "all" {
		query = query.Where("type = ?", jobType)
	}

	// Count total before pagination
	query.Count(&total)

	// Apply pagination and order
	query = query.Order("created_at desc")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}
	err := query.Find(&jobs).Error
	return jobs, total, err
}

func (r *jobRepository) Delete(jobID string, userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var job model.Job
		// Get internal ID for cascading deletes
		if err := tx.Where("job_id = ? AND user_id = ?", jobID, userID).First(&job).Error; err != nil {
			return err
		}

		// Hard delete all associated temporary job tasks to save storage
		if err := tx.Unscoped().Where("job_id = ?", job.JobID).Delete(&model.JobTask{}).Error; err != nil {
			return err
		}

		// Hard delete all detailed job results to save storage (orphan prevention)
		if err := tx.Unscoped().Where("job_internal_id = ?", job.ID).Delete(&model.JobResult{}).Error; err != nil {
			return err
		}

		// Soft delete the main job record (so it remains in lifetime stats)
		if err := tx.Where("id = ?", job.ID).Delete(&model.Job{}).Error; err != nil {
			return err
		}

		return nil
	})
}

func (r *jobRepository) GetStats(userID uint) (map[string]interface{}, error) {
	var stats struct {
		TotalJobs          int64 `json:"total_jobs"`
		TotalVerifications int64 `json:"total_verifications"`
	}
	
	// Use Unscoped() to include soft-deleted jobs in lifetime totals
	err := r.db.Unscoped().Model(&model.Job{}).Where("user_id = ?", userID).Select("COUNT(*) as total_jobs, COALESCE(SUM(total_emails), 0) as total_verifications").Scan(&stats).Error
	
	return map[string]interface{}{
		"total_jobs":          stats.TotalJobs,
		"total_verifications": stats.TotalVerifications,
	}, err
}

func (r *jobRepository) CountActiveJobs(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&model.Job{}).Where("user_id = ? AND type = 'bulk' AND status IN ('pending', 'processing')", userID).Count(&count).Error
	return count, err
}

func (r *jobRepository) CreateBulkJob(userID uint, jobID string, filename string, totalEmails int, invalidSyntaxCount int, queuedCount int, taskRecords []model.JobTask, apiKeyID *uint) (*model.Job, []model.JobTask, error) {
	var job model.Job
	var savedTasks []model.JobTask

	err := r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Atomic credit deduction
		result := tx.Model(&model.User{}).
			Where("id = ? AND credits >= ?", userID, queuedCount).
			Update("credits", gorm.Expr("credits - ?", queuedCount))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fmt.Errorf("insufficient credits")
		}

		// 2. Transaction Log
		txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(6))
		transaction := model.Transaction{
			UserID:        userID,
			TransactionID: txnID,
			Amount:        0,
			CreditsAdded:  -queuedCount,
			Type:          "bulk_verify",
			Status:        "completed",
			Description:   fmt.Sprintf("Bulk verification: %s (%d emails)", filename, queuedCount),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			return err
		}

		// 3. Job Record
		jobStatus := "pending"
		if queuedCount == 0 {
			jobStatus = "completed"
		}

		job = model.Job{
			UserID:         userID,
			JobID:          jobID,
			JobType:        "bulk",
			Status:         jobStatus,
			Filename:       filename,
			TotalEmails:    totalEmails,
			ProcessedCount: invalidSyntaxCount,
			InvalidSyntax:  invalidSyntaxCount,
			Undeliverable:  invalidSyntaxCount,
			APIKeyID:       apiKeyID,
		}
		if err := tx.Create(&job).Error; err != nil {
			return err
		}

		// 4. Save job tasks in chunk
		for i := range taskRecords {
			if err := tx.Create(&taskRecords[i]).Error; err != nil {
				return err
			}
			savedTasks = append(savedTasks, taskRecords[i])
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}
	return &job, savedTasks, nil
}

func (r *jobRepository) RefundBulkJob(userID uint, jobID string, refundCredits int, description string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Job{}).Where("job_id = ?", jobID).Update("status", "failed").Error; err != nil {
			return err
		}

		if err := tx.Model(&model.User{}).Where("id = ?", userID).Update("credits", gorm.Expr("credits + ?", refundCredits)).Error; err != nil {
			return err
		}

		refundTxnID := fmt.Sprintf("REFUND_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
		refundTxn := model.Transaction{
			UserID:        userID,
			TransactionID: refundTxnID,
			Amount:        0,
			CreditsAdded:  refundCredits,
			Type:          "refund",
			Status:        "completed",
			Description:   description,
			Provider:      "system",
		}
		return tx.Create(&refundTxn).Error
	})
}

func (r *jobRepository) ClaimTask(serverName string, taskTimeoutMinutes int) (*model.JobTask, error) {
	var task model.JobTask
	err := r.db.Transaction(func(tx *gorm.DB) error {
		// Try queued first
		// Find oldest queued task
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("status = ?", "queued").
			Order("updated_at ASC, id ASC").
			First(&task).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		} else {
			// Update task status and assigned worker
			return tx.Model(&task).Updates(map[string]interface{}{
				"status":        "processing",
				"worker_server": serverName,
				"updated_at":    time.Now(),
			}).Error
		}

		timeoutAt := time.Now().Add(-time.Duration(taskTimeoutMinutes) * time.Minute)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("status = ? AND updated_at < ?", "processing", timeoutAt).
			Order("updated_at ASC, id ASC").
			First(&task).Error; err != nil {
			return err
		}

		return tx.Model(&task).Updates(map[string]interface{}{
			"status":        "processing",
			"worker_server": serverName,
			"updated_at":    time.Now(),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *jobRepository) GetJobForUser(userID uint, jobID string) (*model.Job, error) {
	var job model.Job
	if err := r.db.Where("(job_id = ? OR id::text = ?) AND user_id = ?", jobID, jobID, userID).First(&job).Error; err != nil {
		return nil, err
	}
	return &job, nil
}

func (r *jobRepository) GetJobResultsRows(jobInternalID uint) (*sql.Rows, error) {
	return r.db.Model(&model.JobResult{}).Select("email, status, reason, is_catch_all, score, created_at, mx_records").Where("job_internal_id = ?", jobInternalID).Rows()
}

func (r *jobRepository) CountAllActiveJobs() (int64, error) {
	var count int64
	err := r.db.Model(&model.Job{}).Where("status IN ?", []string{"pending", "processing"}).Count(&count).Error
	return count, err
}

func (r *jobRepository) CheckAndApplyRiskyRefund(tx *gorm.DB, jobID string) error {
	var job model.Job
	// Lock the row to prevent race conditions
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("job_id = ?", jobID).First(&job).Error; err != nil {
		return err
	}

	if job.Status == "completed" && job.JobType == "bulk" && job.Risky > 0 {
		var refundCount int64
		refundSearch := "%" + job.JobID + "%"
		if err := tx.Model(&model.Transaction{}).
			Where("user_id = ? AND type = 'refund' AND description LIKE ?", job.UserID, refundSearch).
			Count(&refundCount).Error; err != nil {
			return err
		}

		if refundCount > 0 {
			return nil // Already refunded
		}

		// Calculate refund: 80% of Risky count rounded
		refundCredits := (job.Risky*80 + 50) / 100
		if refundCredits > 0 {
			if err := tx.Model(&model.User{}).Where("id = ?", job.UserID).Update("credits", gorm.Expr("credits + ?", refundCredits)).Error; err != nil {
				return err
			}

			refundTxnID := fmt.Sprintf("REFUND_RISKY_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
			refundTxn := model.Transaction{
				UserID:        job.UserID,
				TransactionID: refundTxnID,
				Amount:        0,
				CreditsAdded:  refundCredits,
				Type:          "refund",
				Status:        "completed",
				Description:   fmt.Sprintf("80%% partial refund for %d unknown emails in job %s", job.Risky, job.JobID),
				Provider:      "system",
			}
			if err := tx.Create(&refundTxn).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
