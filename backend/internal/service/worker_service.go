package service

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/tasks"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WorkerReportPayload struct {
	JobID         string   `json:"job_id"`
	JobIDLegacy   string   `json:"jobId"`
	TaskID        uint     `json:"task_id"`
	Email         string   `json:"email"`
	Status        string   `json:"status"`
	Score         int      `json:"score"`
	Reason        string   `json:"reason"`
	TimeTaken     float64  `json:"time_taken"`
	SmtpCode      int      `json:"smtp_code"`
	ServerName    string   `json:"server_name"`
	WorkerName    string   `json:"worker_name"`
	IsDeliverable *bool    `json:"is_deliverable"`
	IsCatchAll    *bool    `json:"is_catch_all"`
	IsDisposable  *bool    `json:"is_disposable"`
	IsFree        *bool    `json:"is_free"`
	IsRole        *bool    `json:"is_role"`
	HasMx         *bool    `json:"has_mx"`
	SmtpConnect   *bool    `json:"smtp_connect"`
	UserExists    *bool    `json:"user_exists"`
	IsSyntaxValid *bool    `json:"is_syntax_valid"`
	IsSpamTrap    *bool    `json:"is_spam_trap"`
	IsBlacklisted *bool    `json:"is_blacklisted"`
	MailboxFull   *bool    `json:"mailbox_full"`
	MxRecords     []string `json:"mx_records"`
}

type WorkerBatchPayload struct {
	JobID       string                `json:"job_id"`
	JobIDLegacy string                `json:"jobId"`
	TaskID      uint                  `json:"task_id"`
	ServerName  string                `json:"server_name"`
	WorkerName  string                `json:"worker_name"`
	Results     []WorkerReportPayload `json:"results"`
}

type WorkerService interface {
	ReportTaskResult(payload *WorkerReportPayload) (*model.Job, *model.JobResult, error)
	ReportTaskResults(payload *WorkerBatchPayload) (*model.Job, []model.JobResult, error)
	BroadcastJobUpdate(jobID string)
	ResetWorkerTasks(serverName string) (int64, error)
	GetWorkerDomains() ([]model.Domain, error)
	UpdateResultFilePath(jobID string, filePath string) error
	IsWorkerEnabled(serverName string) bool
	ReconcileJobStatus(jobID string) error
}

type workerService struct {
	workerRepo   repo.WorkerRepo
	jobRepo      repo.JobRepository
	serverRepo   repo.ServerRepo
	settingsRepo repo.SettingsRepo
}

func NewWorkerService(workerRepo repo.WorkerRepo, jobRepo repo.JobRepository, serverRepo repo.ServerRepo, settingsRepo repo.SettingsRepo) WorkerService {
	return &workerService{
		workerRepo:   workerRepo,
		jobRepo:      jobRepo,
		serverRepo:   serverRepo,
		settingsRepo: settingsRepo,
	}
}

func (s *workerService) IsWorkerEnabled(serverName string) bool {
	return s.workerRepo.IsWorkerEnabled(serverName)
}

func (s *workerService) ReconcileJobStatus(jobID string) error {
	return s.workerRepo.ReconcileJobStatus(jobID)
}

func (s *workerService) ReportTaskResult(payload *WorkerReportPayload) (*model.Job, *model.JobResult, error) {
	jobID := strings.TrimSpace(payload.JobID)
	if jobID == "" {
		jobID = strings.TrimSpace(payload.JobIDLegacy)
	}
	email := strings.ToLower(strings.TrimSpace(payload.Email))
	status := strings.ToLower(strings.TrimSpace(payload.Status))

	if jobID == "" || email == "" || status == "" {
		return nil, nil, errors.New("job_id, email and status are required")
	}

	serverName := strings.TrimSpace(payload.ServerName)
	if serverName == "" {
		serverName = strings.TrimSpace(payload.WorkerName)
	}

	// Fix 3: server_name is required for result push
	if serverName == "" {
		return nil, nil, fmt.Errorf("server_name is required for result push")
	}

	if !s.IsWorkerEnabled(serverName) {
		return nil, nil, fmt.Errorf("worker server '%s' is not enabled or not registered", serverName)
	}

	// Domain policy evaluation
	var isFree, isDisposable, isSpamTrap, isBlacklisted bool
	parts := strings.Split(email, "@")
	if len(parts) == 2 {
		isFree, isDisposable, isSpamTrap, isBlacklisted = s.checkDomainPolicy(parts[1])
	}

	if isDisposable {
		status = "disposable"
		payload.Score = 10
		payload.Reason = "disposable"
		bTrue := true
		payload.IsDisposable = &bTrue
		bFalse := false
		payload.IsDeliverable = &bFalse
	} else if isSpamTrap {
		status = "invalid"
		payload.Score = 0
		payload.Reason = "spamtrap"
		bTrue := true
		payload.IsSpamTrap = &bTrue
		bFalse := false
		payload.IsDeliverable = &bFalse
	} else if isBlacklisted {
		status = "invalid"
		payload.Score = 0
		payload.Reason = "blacklist"
		bTrue := true
		payload.IsBlacklisted = &bTrue
		bFalse := false
		payload.IsDeliverable = &bFalse
	}

	if isFree {
		bTrue := true
		payload.IsFree = &bTrue
	}

	// Centralized status normalization
	status = helper.NormalizeVerificationStatus(status)
	mailboxFull := payload.MailboxFull != nil && *payload.MailboxFull
	status = helper.PromoteMailboxFullToValid(status, mailboxFull)
	if mailboxFull && status == "valid" {
		payload.Status = status
		payload.Score = helper.ScoreForStatus(status)
		bTrue := true
		payload.IsDeliverable = &bTrue
	}

	var job model.Job
	var result model.JobResult

	err := s.workerRepo.DB().Transaction(func(tx *gorm.DB) error {
		// 1. Find the parent job
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("job_id = ?", jobID).
			First(&job).Error; err != nil {
			return err
		}
		if job.Status == "failed" || job.Status == "cancelled" {
			return fmt.Errorf("job %s is %s; ignoring results", jobID, job.Status)
		}

		// Idempotency: ignore duplicates for same job+email
		var existing model.JobResult
		if err := tx.Where("job_internal_id = ? AND email = ?", job.ID, email).First(&existing).Error; err == nil {
			result = existing
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// Lock the job task if provided
		var task model.JobTask
		if payload.TaskID > 0 {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND job_id = ?", payload.TaskID, job.JobID).
				First(&task).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			// Fix 3: Check task is in processing state and belongs to the right worker
			if task.ID > 0 {
				if task.Status != "processing" && task.Status != "queued" {
					return fmt.Errorf("task %d is not in processing or queued state (current: %s)", task.ID, task.Status)
				}
				if task.Status == "queued" {
					task.Status = "processing"
					task.WorkerServer = serverName
					if err := tx.Model(&task).Updates(map[string]interface{}{
						"status":        "processing",
						"worker_server": serverName,
						"updated_at":    time.Now(),
					}).Error; err != nil {
						return err
					}
				} else {
					if task.WorkerServer != "" && task.WorkerServer != serverName {
						return fmt.Errorf("task %d belongs to worker '%s', not '%s'", task.ID, task.WorkerServer, serverName)
					}
				}
			}
		}

		// 2. Update job counters based on status
		processedInc := 1
		deliverableInc := 0
		undeliverableInc := 0
		riskyInc := 0
		catchAllInc := 0
		disposableInc := 0
		roleInc := 0

		isCatchAll := status == "catch_all"
		if payload.IsCatchAll != nil {
			isCatchAll = *payload.IsCatchAll
		}

		isDisposable := status == "disposable"
		if payload.IsDisposable != nil {
			isDisposable = *payload.IsDisposable
		}

		isRole := status == "role"
		if payload.IsRole != nil {
			isRole = *payload.IsRole
		}

		switch status {
		case "valid":
			deliverableInc = 1
		case "unknown":
			riskyInc = 1
		case "catch_all":
			catchAllInc = 1
		case "disposable":
			disposableInc = 1
		case "invalid":
			undeliverableInc = 1
		default:
			riskyInc = 1
		}

		if isCatchAll && catchAllInc == 0 {
			catchAllInc = 1
		}
		if isDisposable && disposableInc == 0 {
			disposableInc = 1
		}
		if isRole && roleInc == 0 {
			roleInc = 1
		}

		updates := map[string]interface{}{
			"processed_count": gorm.Expr("processed_count + ?", processedInc),
			"deliverable":     gorm.Expr("deliverable + ?", deliverableInc),
			"undeliverable":   gorm.Expr("undeliverable + ?", undeliverableInc),
			"risky":           gorm.Expr("risky + ?", riskyInc),
			"catch_all":       gorm.Expr("catch_all + ?", catchAllInc),
			"disposable":      gorm.Expr("disposable + ?", disposableInc),
			"role_accounts":   gorm.Expr("role_accounts + ?", roleInc),
			"status": gorm.Expr(
				"CASE WHEN processed_count + ? >= total_emails THEN 'completed' ELSE 'processing' END",
				processedInc,
			),
		}

		if err := tx.Model(&job).Updates(updates).Error; err != nil {
			return err
		}

		// 3. Create result detail record
		isDeliverable := deliverableInc == 1
		if payload.IsDeliverable != nil {
			isDeliverable = *payload.IsDeliverable
		}
		if isCatchAll || status == "catch_all" || status == "unknown" {
			isDeliverable = false
		}

		isFree := false
		if payload.IsFree != nil {
			isFree = *payload.IsFree
		}

		hasMx := false
		if payload.HasMx != nil {
			hasMx = *payload.HasMx
		}

		smtpConnect := payload.SmtpCode == 250 || payload.SmtpCode == 0
		if payload.SmtpConnect != nil {
			smtpConnect = *payload.SmtpConnect
		}

		userExists := isDeliverable
		if payload.UserExists != nil {
			userExists = *payload.UserExists
		}

		isSyntaxValid := true
		if payload.IsSyntaxValid != nil {
			isSyntaxValid = *payload.IsSyntaxValid
		}

		isSpamTrap := false
		if payload.IsSpamTrap != nil {
			isSpamTrap = *payload.IsSpamTrap
		}

		isBlacklisted := false
		if payload.IsBlacklisted != nil {
			isBlacklisted = *payload.IsBlacklisted
		}

		mailboxFull := false
		if payload.MailboxFull != nil {
			mailboxFull = *payload.MailboxFull
		}

		result = model.JobResult{
			JobInternalID:  job.ID,
			Email:          email,
			Status:         status,
			Score:          payload.Score,
			Reason:         payload.Reason,
			ProcessingTime: payload.TimeTaken,
			IsDisposable:   isDisposable,
			IsFree:         isFree,
			IsRole:         isRole,
			HasMx:          hasMx,
			SmtpConnect:    smtpConnect,
			UserExists:     userExists,
			IsCatchAll:     isCatchAll,
			IsDeliverable:  isDeliverable,
			IsSyntaxValid:  isSyntaxValid,
			IsSpamTrap:     isSpamTrap,
			IsBlacklisted:  isBlacklisted,
			MailboxFull:    mailboxFull,
		}
		if err := tx.Create(&result).Error; err != nil {
			return err
		}

		// 4. Update the owning JobTask
		if payload.TaskID > 0 && task.ID > 0 {
			taskUpdate := map[string]interface{}{
				"pushed_count": gorm.Expr("LEAST(pushed_count + ?, (end_index - start_index + 1))", processedInc),
				"status": gorm.Expr(
					"CASE WHEN pushed_count + ? >= (end_index - start_index + 1) THEN 'completed' ELSE 'processing' END",
					processedInc,
				),
				"updated_at": time.Now(),
			}
			if serverName != "" {
				taskUpdate["worker_server"] = serverName
			}
			if err := tx.Model(&model.JobTask{}).
				Where("id = ? AND job_id = ?", task.ID, job.JobID).
				Updates(taskUpdate).Error; err != nil {
				return err
			}
		}

		// 5. Update worker server usage (lifetime + UTC daily)
		if serverName != "" {
			bumpWorkerVerifiedCount(tx, serverName, processedInc)
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}
	return &job, &result, nil
}

func (s *workerService) ReportTaskResults(payload *WorkerBatchPayload) (*model.Job, []model.JobResult, error) {
	jobID := strings.TrimSpace(payload.JobID)
	if jobID == "" {
		jobID = strings.TrimSpace(payload.JobIDLegacy)
	}
	if jobID == "" || payload.TaskID == 0 {
		return nil, nil, errors.New("job_id and task_id are required")
	}

	if len(payload.Results) == 0 {
		return nil, nil, errors.New("no valid results to process")
	}

	serverName := strings.TrimSpace(payload.ServerName)
	if serverName == "" {
		serverName = strings.TrimSpace(payload.WorkerName)
	}

	// Fix 3: server_name is required for result push
	if serverName == "" {
		return nil, nil, fmt.Errorf("server_name is required for result push")
	}

	if !s.IsWorkerEnabled(serverName) {
		return nil, nil, fmt.Errorf("worker server '%s' is not enabled or not registered", serverName)
	}

	emails := make([]string, 0, len(payload.Results))
	clean := make([]WorkerReportPayload, 0, len(payload.Results))
	for _, r := range payload.Results {
		e := strings.ToLower(strings.TrimSpace(r.Email))
		if e == "" {
			continue
		}

		// Domain policy evaluation
		var isFree, isDisposable, isSpamTrap, isBlacklisted bool
		parts := strings.Split(e, "@")
		if len(parts) == 2 {
			isFree, isDisposable, isSpamTrap, isBlacklisted = s.checkDomainPolicy(parts[1])
		}

		status := strings.ToLower(strings.TrimSpace(r.Status))
		if isDisposable {
			status = "disposable"
			r.Score = 10
			r.Reason = "disposable"
			bTrue := true
			r.IsDisposable = &bTrue
			bFalse := false
			r.IsDeliverable = &bFalse
		} else if isSpamTrap {
			status = "invalid"
			r.Score = 0
			r.Reason = "spamtrap"
			bTrue := true
			r.IsSpamTrap = &bTrue
			bFalse := false
			r.IsDeliverable = &bFalse
		} else if isBlacklisted {
			status = "invalid"
			r.Score = 0
			r.Reason = "blacklist"
			bTrue := true
			r.IsBlacklisted = &bTrue
			bFalse := false
			r.IsDeliverable = &bFalse
		}

		if isFree {
			bTrue := true
			r.IsFree = &bTrue
		}

		// Centralized status normalization
		status = helper.NormalizeVerificationStatus(status)
		mailboxFull := r.MailboxFull != nil && *r.MailboxFull
		status = helper.PromoteMailboxFullToValid(status, mailboxFull)
		if mailboxFull && status == "valid" {
			r.Score = helper.ScoreForStatus(status)
			bTrue := true
			r.IsDeliverable = &bTrue
		}
		r.Email = e
		r.Status = status

		if r.Reason == "" {
			r.Reason = "worker"
		}
		clean = append(clean, r)
		emails = append(emails, e)
	}

	if len(clean) == 0 {
		return nil, nil, errors.New("no valid results to process")
	}

	processedIncTotal := 0
	deliverableInc := 0
	undeliverableInc := 0
	riskyInc := 0
	catchAllInc := 0
	disposableInc := 0
	roleInc := 0

	var job model.Job
	var batchWriteRows []model.JobResult

	err := s.workerRepo.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("job_id = ?", jobID).
			First(&job).Error; err != nil {
			return err
		}
		if job.Status == "failed" || job.Status == "cancelled" {
			return fmt.Errorf("job %s is %s; ignoring results", jobID, job.Status)
		}

		var task model.JobTask
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND job_id = ?", payload.TaskID, job.JobID).
			First(&task).Error; err != nil {
			return err
		}
		// Fix 3: Check task status and worker ownership
		if task.Status == "failed" || task.Status == "cancelled" {
			return fmt.Errorf("task %d is %s; ignoring results", task.ID, task.Status)
		}
		if task.Status != "processing" && task.Status != "queued" {
			return fmt.Errorf("task %d is not in processing or queued state (current: %s)", task.ID, task.Status)
		}
		if task.Status == "queued" {
			task.Status = "processing"
			task.WorkerServer = serverName
			if err := tx.Model(&task).Updates(map[string]interface{}{
				"status":        "processing",
				"worker_server": serverName,
				"updated_at":    time.Now(),
			}).Error; err != nil {
				return err
			}
		} else {
			if task.WorkerServer != "" && task.WorkerServer != serverName {
				return fmt.Errorf("task %d belongs to worker '%s', not '%s'", task.ID, task.WorkerServer, serverName)
			}
		}

		var existing []model.JobResult
		if err := tx.Select("email").Where("job_internal_id = ? AND email IN ?", job.ID, emails).Find(&existing).Error; err != nil {
			return err
		}
		exists := make(map[string]struct{}, len(existing))
		for _, e := range existing {
			exists[e.Email] = struct{}{}
		}

		newRows := make([]model.JobResult, 0, len(clean))

		for _, r := range clean {
			if _, ok := exists[r.Email]; ok {
				continue
			}

			status := helper.NormalizeVerificationStatus(r.Status)
			isCatchAll := status == "catch_all"
			if r.IsCatchAll != nil {
				isCatchAll = *r.IsCatchAll
			}
			isDisposable := status == "disposable"
			if r.IsDisposable != nil {
				isDisposable = *r.IsDisposable
			}
			isRole := status == "role"
			if r.IsRole != nil {
				isRole = *r.IsRole
			}

			switch status {
			case "valid":
				deliverableInc++
			case "unknown":
				riskyInc++
			case "catch_all":
				catchAllInc++
			case "disposable":
				disposableInc++
			case "invalid":
				undeliverableInc++
			default:
				riskyInc++
			}

			if isCatchAll && status != "catch_all" {
				catchAllInc++
			}
			if isDisposable && status != "disposable" {
				disposableInc++
			}
			if isRole {
				roleInc++
			}

			isDeliverable := status == "valid" || status == "deliverable"
			if r.IsDeliverable != nil {
				isDeliverable = *r.IsDeliverable
			}
			if isCatchAll || status == "catch_all" || status == "unknown" {
				isDeliverable = false
			}

			isFree := false
			if r.IsFree != nil {
				isFree = *r.IsFree
			}

			hasMx := false
			if r.HasMx != nil {
				hasMx = *r.HasMx
			}

			smtpConnect := r.SmtpCode == 250 || r.SmtpCode == 0
			if r.SmtpConnect != nil {
				smtpConnect = *r.SmtpConnect
			}

			userExists := isDeliverable
			if r.UserExists != nil {
				userExists = *r.UserExists
			}

			isSyntaxValid := true
			if r.IsSyntaxValid != nil {
				isSyntaxValid = *r.IsSyntaxValid
			}

			isSpamTrap := false
			if r.IsSpamTrap != nil {
				isSpamTrap = *r.IsSpamTrap
			}

			isBlacklisted := false
			if r.IsBlacklisted != nil {
				isBlacklisted = *r.IsBlacklisted
			}

			mailboxFull := false
			if r.MailboxFull != nil {
				mailboxFull = *r.MailboxFull
			}

			newRows = append(newRows, model.JobResult{
				JobInternalID:  job.ID,
				Email:          r.Email,
				Status:         status,
				Score:          r.Score,
				Reason:         r.Reason,
				ProcessingTime: r.TimeTaken,
				IsDisposable:   isDisposable,
				IsFree:         isFree,
				IsRole:         isRole,
				HasMx:          hasMx,
				MxRecords:      r.MxRecords,
				SmtpConnect:    smtpConnect,
				UserExists:     userExists,
				IsCatchAll:     isCatchAll,
				IsDeliverable:  isDeliverable,
				IsSyntaxValid:  isSyntaxValid,
				IsSpamTrap:     isSpamTrap,
				IsBlacklisted:  isBlacklisted,
				MailboxFull:    mailboxFull,
			})

			processedIncTotal++
		}

		if processedIncTotal == 0 {
			return nil
		}

		if err := tx.CreateInBatches(&newRows, 200).Error; err != nil {
			return err
		}
		batchWriteRows = append(batchWriteRows, newRows...)

		if err := tx.Model(&job).Updates(map[string]interface{}{
			"processed_count": gorm.Expr("processed_count + ?", processedIncTotal),
			"deliverable":     gorm.Expr("deliverable + ?", deliverableInc),
			"undeliverable":   gorm.Expr("undeliverable + ?", undeliverableInc),
			"risky":           gorm.Expr("risky + ?", riskyInc),
			"catch_all":       gorm.Expr("catch_all + ?", catchAllInc),
			"disposable":      gorm.Expr("disposable + ?", disposableInc),
			"role_accounts":   gorm.Expr("role_accounts + ?", roleInc),
			"status": gorm.Expr(
				"CASE WHEN processed_count + ? >= total_emails THEN 'completed' ELSE 'processing' END",
				processedIncTotal,
			),
		}).Error; err != nil {
			return err
		}

		taskUpdate := map[string]interface{}{
			"pushed_count": gorm.Expr("LEAST(pushed_count + ?, (end_index - start_index + 1))", processedIncTotal),
			"status": gorm.Expr(
				"CASE WHEN pushed_count + ? >= (end_index - start_index + 1) THEN 'completed' ELSE 'processing' END",
				processedIncTotal,
			),
			"updated_at": time.Now(),
		}
		if serverName != "" {
			taskUpdate["worker_server"] = serverName
		}
		if err := tx.Model(&model.JobTask{}).
			Where("id = ? AND job_id = ?", task.ID, job.JobID).
			Updates(taskUpdate).Error; err != nil {
			return err
		}

		if serverName != "" {
			bumpWorkerVerifiedCount(tx, serverName, processedIncTotal)
		}

		// Trigger risky refund check if job completes
		if err := s.jobRepo.CheckAndApplyRiskyRefund(tx, job.JobID); err != nil {
			logger.Error("Failed to check/apply risky refund on task report", "job_id", job.JobID, "error", err)
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}

	return &job, batchWriteRows, nil
}

func (s *workerService) BroadcastJobUpdate(jobID string) {
	var job model.Job
	if err := s.workerRepo.DB().Where("job_id = ?", jobID).First(&job).Error; err == nil {
		ws.GlobalHub.Broadcast <- ws.Message{
			UserID: job.UserID,
			JobID:  job.JobID,
			Type:   "job_update",
			Data: gin.H{
				"job_id":          job.JobID,
				"status":          job.Status,
				"type":            job.JobType,
				"filename":        job.Filename,
				"total_emails":    job.TotalEmails,
				"processed_count": job.ProcessedCount,
				"created_at":      job.CreatedAt,
				"deliverable":     job.Deliverable,
				"undeliverable":   job.Undeliverable,
				"risky":           job.Risky,
				"catch_all":       job.CatchAll,
				"disposable":      job.Disposable,
				"role_accounts":   job.RoleAccounts,
			},
		}
	}

	// Trigger Webhook/Email for major status changes
	if job.Status == "completed" || job.Status == "failed" {
		var user model.User
		if err := s.workerRepo.DB().First(&user, job.UserID).Error; err == nil {
			if job.Status == "completed" {
				frontendURL := os.Getenv("FRONTEND_URL")
				if frontendURL == "" {
					frontendURL = "http://localhost:3000"
				}
				go NewEmailService(repo.NewSystemRepo()).SendTemplateEmail(user.Email, "job_completed", map[string]string{
					"name":          user.Name,
					"job_id":        job.JobID,
					"download_link": fmt.Sprintf("%s/dashboard/jobs/%s/download", frontendURL, job.JobID),
				})
			}

			if user.WebhookURL != "" {
				eventType := "job." + job.Status
				webhookData := map[string]interface{}{
					"job_id":          job.JobID,
					"event":           eventType,
					"status":          job.Status,
					"total_emails":    job.TotalEmails,
					"processed_count": job.ProcessedCount,
					"deliverable":     job.Deliverable,
					"undeliverable":   job.Undeliverable,
					"risky":           job.Risky,
					"catch_all":       job.CatchAll,
					"disposable":      job.Disposable,
					"role_accounts":   job.RoleAccounts,
					"timestamp":       time.Now().Format(time.RFC3339),
				}

				task, err := tasks.NewWebhookDeliverTask(user.WebhookURL, user.WebhookSecret, eventType, webhookData)
				if err == nil {
					config.AsynqClient.Enqueue(task, asynq.MaxRetry(5), asynq.Queue("low"))
					logger.Info("Webhook enqueued", "job_id", job.JobID, "event", eventType, "user_id", user.ID)
				} else {
					logger.Error("Failed to create webhook task", "job_id", job.JobID, "error", err)
				}
			}
		}
	}
}

func (s *workerService) ResetWorkerTasks(serverName string) (int64, error) {
	return s.workerRepo.ResetWorkerTasks(serverName)
}

func (s *workerService) GetWorkerDomains() ([]model.Domain, error) {
	return s.workerRepo.GetWorkerDomains()
}

func (s *workerService) UpdateResultFilePath(jobID string, filePath string) error {
	return s.workerRepo.UpdateResultFilePath(jobID, filePath)
}

func (s *workerService) checkDomainPolicy(domain string) (isFree, isDisposable, isSpamTrap, isBlacklisted bool) {
	return s.workerRepo.CheckDomainPolicy(domain)
}

// bumpWorkerVerifiedCount increments lifetime + UTC-day counters for a worker node.
func bumpWorkerVerifiedCount(tx *gorm.DB, serverName string, n int) {
	if tx == nil || serverName == "" || n <= 0 {
		return
	}
	today := time.Now().UTC().Format("2006-01-02")
	_ = tx.Exec(`
		UPDATE worker_servers SET
			emails_verified = emails_verified + ?,
			emails_verified_today = CASE
				WHEN verified_on_date = ?::date THEN emails_verified_today + ?
				ELSE ?
			END,
			verified_on_date = ?::date
		WHERE server_name = ?
	`, n, today, n, n, today, serverName).Error
}
