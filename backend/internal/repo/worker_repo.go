package repo

import (
	"fmt"
	"math"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WorkerRepo interface {
	DB() *gorm.DB
	IsWorkerEnabled(serverName string) bool
	ReconcileJobStatus(jobID string) error
	CompleteTask(taskID uint, status string) error
	ResetWorkerTasks(serverName string) (int64, error)
	GetWorkerDomains() ([]model.Domain, error)
	UpdateResultFilePath(jobID string, filePath string) error
	CheckDomainPolicy(domain string) (isFree, isDisposable, isSpamTrap, isBlacklisted bool)
}

type workerRepo struct {
	db *gorm.DB
}

func NewWorkerRepo() WorkerRepo {
	return &workerRepo{db: config.DB}
}

func (r *workerRepo) DB() *gorm.DB {
	return r.db
}

func (r *workerRepo) IsWorkerEnabled(serverName string) bool {
	var rows []struct{ Enabled bool }
	result := r.db.Model(&model.WorkerServer{}).
		Select("enabled").
		Where("server_name = ?", serverName).
		Find(&rows)
	if result.Error != nil || len(rows) != 1 {
		return false // server not found or ambiguous
	}
	return rows[0].Enabled
}

func (r *workerRepo) ReconcileJobStatus(jobID string) error {
	var counts struct {
		QueuedCount     int64
		ProcessingCount int64
		FailedCount     int64
	}
	r.db.Model(&model.JobTask{}).
		Select("SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued_count, " +
			"SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_count, " +
			"SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count").
		Where("job_id = ?", jobID).
		Scan(&counts)

	// If tasks still active, nothing to do
	if counts.QueuedCount+counts.ProcessingCount > 0 {
		return nil
	}

	// If no failed tasks, check if job processed count matches total
	if counts.FailedCount == 0 {
		var job model.Job
		if err := r.db.Where("job_id = ?", jobID).First(&job).Error; err != nil {
			return err
		}
		if job.TotalEmails > 0 && int64(job.ProcessedCount) < int64(job.TotalEmails) {
			// Requeue tasks that were completed but have pushed_count < expected
			result := r.db.Model(&model.JobTask{}).
				Where("job_id = ? AND status = 'completed' AND pushed_count < (end_index - start_index + 1)", jobID).
				Updates(map[string]interface{}{
					"status":        "queued",
					"worker_server": "",
					"updated_at":    time.Now(),
				})
			if result.RowsAffected > 0 {
				r.db.Model(&model.Job{}).Where("job_id = ?", jobID).Update("status", "processing")
				return nil
			}
		}
	}

	// Set final job status and handle 80% refund for risky (unknown) emails
	newStatus := "completed"
	if counts.FailedCount > 0 {
		newStatus = "failed"
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		var job model.Job
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("job_id = ?", jobID).First(&job).Error; err != nil {
			return err
		}

		if job.Status == "completed" {
			return nil
		}

		if err := tx.Model(&job).Update("status", newStatus).Error; err != nil {
			return err
		}

		// Apply 80% refund for risky emails if job completed successfully
		if newStatus == "completed" && job.JobType == "bulk" && job.Risky > 0 {
			refundCredits := int(math.Round(float64(job.Risky) * 0.80))
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
	})
}

func (r *workerRepo) CompleteTask(taskID uint, status string) error {
	// Let service handle this logic if we want, or do it here.
	// We'll keep DB in repo and logic in service. 
	// The problem is CompleteTask has logic. Let's do it here.
	var task model.JobTask
	if err := r.db.Where("id = ?", taskID).First(&task).Error; err != nil {
		return gorm.ErrRecordNotFound
	}

	expectedCount := int64(task.EndIndex - task.StartIndex + 1)
	pushedCount := int64(task.PushedCount)

	var job model.Job
	r.db.Where("job_id = ?", task.JobID).Select("processed_count, total_emails").First(&job)
	jobFullyProcessed := job.TotalEmails > 0 && int64(job.ProcessedCount) >= int64(job.TotalEmails)

	if status == "completed" && pushedCount < expectedCount && !jobFullyProcessed {
		r.db.Model(&model.JobTask{}).
			Where("id = ? AND status = 'processing'", taskID).
			Updates(map[string]interface{}{
				"status":        "queued",
				"worker_server": "",
				"updated_at":    time.Now(),
			})
		return gorm.ErrInvalidData
	}

	if status == "completed" && pushedCount < expectedCount && jobFullyProcessed {
		r.db.Model(&model.JobTask{}).Where("id = ?", taskID).Update("pushed_count", expectedCount)
	}

	result := r.db.Model(&model.JobTask{}).
		Where("id = ? AND status = 'processing'", taskID).
		Updates(map[string]interface{}{"status": status, "updated_at": time.Now()})
	
	if result.RowsAffected == 0 {
		return gorm.ErrInvalidTransaction
	}

	return nil
}

func (r *workerRepo) ResetWorkerTasks(serverName string) (int64, error) {
	res := r.db.Model(&model.JobTask{}).
		Where("worker_server = ? AND status = ?", serverName, "processing").
		Update("status", "queued")
	return res.RowsAffected, res.Error
}

func (r *workerRepo) GetWorkerDomains() ([]model.Domain, error) {
	var domains []model.Domain
	err := r.db.Where("excluded = ?", false).Find(&domains).Error
	return domains, err
}

func (r *workerRepo) UpdateResultFilePath(jobID string, filePath string) error {
	return r.db.Model(&model.Job{}).Where("job_id = ?", jobID).Update("result_file_path", filePath).Error
}

func (r *workerRepo) CheckDomainPolicy(domain string) (isFree, isDisposable, isSpamTrap, isBlacklisted bool) {
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return
	}

	for i := 0; i <= len(parts)-2; i++ {
		candidate := strings.Join(parts[i:], ".")

		var domainPolicy struct {
			Type string
		}

		err := r.db.Table("domains").
			Select("type").
			Where("domain = ? AND excluded = ?", candidate, false).
			First(&domainPolicy).Error

		if err == nil {
			switch domainPolicy.Type {
			case "free":
				isFree = true
			case "disposable":
				isDisposable = true
			case "spam-trap", "spam_trap":
				isSpamTrap = true
			case "blacklist":
				isBlacklisted = true
			}
			return
		}
	}
	return
}
