package handler

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/storage"
	"ejp-backend/internal/tasks"
	"ejp-backend/internal/ws"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/logger"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// WorkerReportPayload matches the data sent by workers
type WorkerReportPayload struct {
	JobID         string  `json:"job_id"`
	JobIDLegacy   string  `json:"jobId"`
	TaskID        uint    `json:"task_id"`
	Email         string  `json:"email"`
	Status        string  `json:"status"`
	Score         int     `json:"score"`
	Reason        string  `json:"reason"`
	TimeTaken     float64 `json:"time_taken"`
	SmtpCode      int     `json:"smtp_code"`
	ServerName    string  `json:"server_name"`
	WorkerName    string  `json:"worker_name"`
	IsDeliverable *bool   `json:"is_deliverable"`
	IsCatchAll    *bool   `json:"is_catch_all"`
	IsDisposable  *bool   `json:"is_disposable"`
	IsFree        *bool   `json:"is_free"`
	IsRole        *bool   `json:"is_role"`
	HasMx         *bool   `json:"has_mx"`
	SmtpConnect   *bool   `json:"smtp_connect"`
	UserExists    *bool   `json:"user_exists"`
	IsSyntaxValid *bool   `json:"is_syntax_valid"`
	IsSpamTrap    *bool   `json:"is_spam_trap"`
	IsBlacklisted *bool   `json:"is_blacklisted"`
	MailboxFull   *bool   `json:"mailbox_full"`
}

var workerAuthSettingsCache struct {
	mu        sync.RWMutex
	hash      string
	encrypted string
	expiresAt time.Time
}

func getWorkerAuthSettings() (string, string) {
	now := time.Now()

	workerAuthSettingsCache.mu.RLock()
	if now.Before(workerAuthSettingsCache.expiresAt) {
		hash := workerAuthSettingsCache.hash
		encrypted := workerAuthSettingsCache.encrypted
		workerAuthSettingsCache.mu.RUnlock()
		return hash, encrypted
	}
	workerAuthSettingsCache.mu.RUnlock()

	var hashSetting model.Setting
	var encSetting model.Setting
	hash := ""
	encrypted := ""

	if err := config.DB.Select("setting_value").Where("setting_key = ?", "worker_api_key_hash").First(&hashSetting).Error; err == nil {
		hash = hashSetting.SettingValue
	}
	if err := config.DB.Select("setting_value").Where("setting_key = ?", "worker_api_key_encrypted").First(&encSetting).Error; err == nil {
		encrypted = encSetting.SettingValue
	}

	workerAuthSettingsCache.mu.Lock()
	workerAuthSettingsCache.hash = hash
	workerAuthSettingsCache.encrypted = encrypted
	workerAuthSettingsCache.expiresAt = now.Add(1 * time.Minute)
	workerAuthSettingsCache.mu.Unlock()

	return hash, encrypted
}

// ClaimTask allows a worker server to claim a chunk of email verification tasks
func ClaimTask(c *gin.Context) {
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	// Legacy Parity: Transactional claim with FOR UPDATE
	var task model.JobTask
	err := config.DB.Transaction(func(tx *gorm.DB) error {
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
				"worker_server": input.ServerName,
				"updated_at":    time.Now(),
			}).Error
		}

		// Fallback: reclaim timed-out processing task (legacy behaviour)
		taskTimeoutMinutes := 10
		var timeoutSetting model.Setting
		if err := tx.Where("setting_key = ?", "task_timeout_minutes").First(&timeoutSetting).Error; err == nil {
			if v, convErr := helper.SafeAtoi(timeoutSetting.SettingValue); convErr == nil && v > 0 {
				taskTimeoutMinutes = v
			}
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
			"worker_server": input.ServerName,
			"updated_at":    time.Now(),
		}).Error
	})

	if err != nil {
		helper.SendError(c, http.StatusNotFound, "No tasks available", "ERR_NO_TASKS")
		return
	}

	helper.SendSuccess(c, "Task claimed", task)
}

type workerBatchPayload struct {
	JobID       string                `json:"job_id"`
	JobIDLegacy string                `json:"jobId"`
	TaskID      uint                  `json:"task_id"`
	ServerName  string                `json:"server_name"`
	WorkerName  string                `json:"worker_name"`
	Results     []WorkerReportPayload `json:"results"`
}

// ReportTaskResult processes a single verification result from a worker
func ReportTaskResult(c *gin.Context) {
	var payload WorkerReportPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	jobID := strings.TrimSpace(payload.JobID)
	if jobID == "" {
		jobID = strings.TrimSpace(payload.JobIDLegacy)
	}
	email := strings.ToLower(strings.TrimSpace(payload.Email))
	status := strings.ToLower(strings.TrimSpace(payload.Status))
	if jobID == "" || email == "" || status == "" {
		helper.SendError(c, http.StatusBadRequest, "job_id, email and status are required", "ERR_BAD_REQUEST")
		return
	}

	serverName := strings.TrimSpace(payload.ServerName)
	if serverName == "" {
		serverName = strings.TrimSpace(payload.WorkerName)
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Find the parent job
		var job model.Job
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("job_id = ?", jobID).
			First(&job).Error; err != nil {
			return err
		}

		// Idempotency: ignore duplicates for same job+email
		var existing model.JobResult
		if err := tx.Where("job_internal_id = ? AND email = ?", job.ID, email).First(&existing).Error; err == nil {
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// Lock the job task if provided (best-effort for backwards compatibility)
		var task model.JobTask
		if payload.TaskID > 0 {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND job_id = ?", payload.TaskID, job.JobID).
				First(&task).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
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

		isCatchAll := status == "catch_all" || status == "catch-all"
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
		case "valid", "deliverable":
			deliverableInc = 1
		case "unknown", "risky":
			riskyInc = 1
		case "catch_all", "catch-all":
			catchAllInc = 1
		case "disposable":
			disposableInc = 1
		default:
			undeliverableInc = 1
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

		// 3. Create result detail record (Internal DB for quick lookup)
		isDeliverable := deliverableInc == 1
		if payload.IsDeliverable != nil {
			isDeliverable = *payload.IsDeliverable
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

		result := model.JobResult{
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

		// 4. Update the owning JobTask (best-effort)
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

		// 5. Update worker server usage (best-effort)
		if serverName != "" {
			_ = tx.Model(&model.WorkerServer{}).
				Where("server_name = ?", serverName).
				Update("emails_verified", gorm.Expr("emails_verified + ?", processedInc)).Error
		}

		return nil
	})

	if err != nil {
		logger.Error("Failed to record result", "job_id", jobID, "email", email, "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to record result", err.Error())
		return
	}

	helper.SendSuccess(c, "Result recorded", nil)
	logger.Info("Single result recorded", "job_id", jobID, "email", email, "status", status)

	// Async: persist result to ndjson file (bulk jobs only)
	go func() {
		var j model.Job
		if err := config.DB.Where("job_id = ?", jobID).First(&j).Error; err != nil {
			return
		}
		if j.JobType != "bulk" {
			return
		}
		basePath := os.Getenv("BULK_JOBS_PATH")
		if basePath == "" {
			basePath = "./storage/bulk_jobs"
		}
		row := storage.ResultRow{
			JobID:      jobID,
			Email:      email,
			Status:     status,
			Score:      payload.Score,
			Reason:     payload.Reason,
			VerifiedAt: time.Now(),
		}
		if payload.IsCatchAll != nil {
			row.IsCatchAll = *payload.IsCatchAll
		}
		if payload.IsDeliverable != nil {
			row.IsDeliverable = *payload.IsDeliverable
		}
		if payload.IsDisposable != nil {
			row.IsDisposable = *payload.IsDisposable
		}
		if payload.HasMx != nil {
			row.HasMx = *payload.HasMx
		}
		filePath, err := storage.AppendResult(basePath, jobID, row)
		if err != nil {
			logger.Error("ndjson: failed to append result", "job_id", jobID, "error", err)
			return
		}
		// Update ResultFilePath in DB if not already set
		if j.ResultFilePath == "" {
			config.DB.Model(&j).Update("result_file_path", filePath)
		}
	}()

	// Broadcast update via WebSocket
	broadcastJobUpdate(jobID)
}

func broadcastJobUpdate(jobID string) {
	var job model.Job
	if err := config.DB.Where("job_id = ?", jobID).First(&job).Error; err == nil {
		ws.GlobalHub.Broadcast <- ws.Message{
			UserID: job.UserID,
			JobID:  job.JobID,
			Type:   "job_update",
			Data: gin.H{
				"job_id":          job.JobID,
				"status":          job.Status,
				"total_emails":    job.TotalEmails,
				"processed_count": job.ProcessedCount,
				"deliverable":     job.Deliverable,
				"undeliverable":   job.Undeliverable,
				"risky":           job.Risky,
				"catch_all":       job.CatchAll,
				"disposable":      job.Disposable,
				"role_accounts":   job.RoleAccounts,
			},
		}
	}

	// Trigger Webhook for major status changes
	if job.Status == "completed" || job.Status == "failed" {
		var user model.User
		if err := config.DB.First(&user, job.UserID).Error; err == nil {
			if job.Status == "completed" {
				frontendURL := os.Getenv("FRONTEND_URL")
				if frontendURL == "" {
					frontendURL = "http://localhost:3000"
				}
				go service.NewEmailService(repo.NewSystemRepo()).SendTemplateEmail(user.Email, "job_completed", map[string]string{
					"name": user.Name,
					"job_id": job.JobID,
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

// ReportTaskResults processes a batch of verification results from a worker
func ReportTaskResults(c *gin.Context) {
	var payload workerBatchPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	jobID := strings.TrimSpace(payload.JobID)
	if jobID == "" {
		jobID = strings.TrimSpace(payload.JobIDLegacy)
	}
	if jobID == "" || payload.TaskID == 0 {
		helper.SendError(c, http.StatusBadRequest, "job_id and task_id are required", "ERR_BAD_REQUEST")
		return
	}

	if len(payload.Results) == 0 {
		helper.SendError(c, http.StatusBadRequest, "No valid results to process", "ERR_EMPTY_RESULTS")
		return
	}
	if len(payload.Results) > 1000 {
		helper.SendError(c, http.StatusBadRequest, "Batch too large (max 1000)", "ERR_BATCH_TOO_LARGE")
		return
	}

	serverName := strings.TrimSpace(payload.ServerName)
	if serverName == "" {
		serverName = strings.TrimSpace(payload.WorkerName)
	}

	emails := make([]string, 0, len(payload.Results))
	clean := make([]WorkerReportPayload, 0, len(payload.Results))
	for _, r := range payload.Results {
		e := strings.ToLower(strings.TrimSpace(r.Email))
		s := strings.ToLower(strings.TrimSpace(r.Status))
		if e == "" || s == "" {
			continue
		}
		r.Email = e
		r.Status = s
		if r.Reason == "" {
			r.Reason = "worker"
		}
		clean = append(clean, r)
		emails = append(emails, e)
	}

	if len(clean) == 0 {
		helper.SendError(c, http.StatusBadRequest, "No valid results to process", "ERR_EMPTY_RESULTS")
		return
	}

	processedIncTotal := 0
	deliverableInc := 0
	undeliverableInc := 0
	riskyInc := 0
	catchAllInc := 0
	disposableInc := 0
	roleInc := 0

	// Declare newRows outside transaction so it's accessible for ndjson async write
	var batchWriteRows []model.JobResult

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var job model.Job
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("job_id = ?", jobID).
			First(&job).Error; err != nil {
			return err
		}

		var task model.JobTask
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND job_id = ?", payload.TaskID, job.JobID).
			First(&task).Error; err != nil {
			return err
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

			status := strings.ToLower(strings.TrimSpace(r.Status))
			isCatchAll := status == "catch_all" || status == "catch-all"
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
			case "valid", "deliverable":
				deliverableInc++
			case "unknown", "risky":
				riskyInc++
			case "catch_all", "catch-all":
				catchAllInc++
			case "disposable":
				disposableInc++
			default:
				undeliverableInc++
			}

			if isCatchAll && status != "catch_all" && status != "catch-all" {
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
		// Capture rows for async ndjson write outside the transaction
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
			_ = tx.Model(&model.WorkerServer{}).
				Where("server_name = ?", serverName).
				Update("emails_verified", gorm.Expr("emails_verified + ?", processedIncTotal)).Error
		}

		return nil
	})

	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to record results", err.Error())
		return
	}

	helper.SendSuccess(c, "Batch results recorded", nil)
	logger.Info("Batch results recorded", "job_id", jobID, "task_id", payload.TaskID, "count", processedIncTotal)

	// Async: persist batch to ndjson file
	go func(jID string, rows []model.JobResult) {
		var j model.Job
		if err := config.DB.Where("job_id = ?", jID).First(&j).Error; err != nil || j.JobType != "bulk" {
			return
		}
		basePath := os.Getenv("BULK_JOBS_PATH")
		if basePath == "" {
			basePath = "./storage/bulk_jobs"
		}
		storeRows := make([]storage.ResultRow, 0, len(rows))
		for _, r := range rows {
			storeRows = append(storeRows, storage.ResultRow{
				JobID:          jID,
				Email:          r.Email,
				Status:         r.Status,
				Score:          r.Score,
				Reason:         r.Reason,
				IsCatchAll:     r.IsCatchAll,
				IsDeliverable:  r.IsDeliverable,
				IsDisposable:   r.IsDisposable,
				IsFree:         r.IsFree,
				IsRole:         r.IsRole,
				HasMx:          r.HasMx,
				SmtpConnect:    r.SmtpConnect,
				IsSpamTrap:     r.IsSpamTrap,
				IsBlacklisted:  r.IsBlacklisted,
				MailboxFull:    r.MailboxFull,
				IsSyntaxValid:  r.IsSyntaxValid,
				ProcessingTime: r.ProcessingTime,
				VerifiedAt:     time.Now(),
			})
		}
		filePath, err := storage.AppendBatch(basePath, jID, storeRows)
		if err != nil {
			logger.Error("ndjson: failed to append batch", "job_id", jID, "error", err)
			return
		}
		// Update ResultFilePath in DB if not already set
		if j.ResultFilePath == "" && filePath != "" {
			config.DB.Model(&j).Update("result_file_path", filePath)
		}
	}(jobID, batchWriteRows)

	// Broadcast update via WebSocket
	broadcastJobUpdate(jobID)
}

// CompleteTask marks a chunk as finished
func CompleteTask(c *gin.Context) {
	var input struct {
		TaskID uint   `json:"task_id" binding:"required"`
		Status string `json:"status" binding:"required"` // completed or failed
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	var task model.JobTask
	if err := config.DB.Where("id = ?", input.TaskID).First(&task).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "Task not found", "")
		return
	}

	if err := config.DB.Model(&task).Update("status", input.Status).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update task status", "")
		return
	}

	helper.SendSuccess(c, "Task status updated", nil)

	// Broadcast update to reflect final job status
	broadcastJobUpdate(task.JobID)
}

// ResetWorkerTasks releases tasks from a crashed or offline worker
func ResetWorkerTasks(c *gin.Context) {
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	res := config.DB.Model(&model.JobTask{}).
		Where("worker_server = ? AND status = ?", input.ServerName, "processing").
		Update("status", "queued")

	if res.Error != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to reset tasks", "")
		return
	}

	helper.SendSuccess(c, fmt.Sprintf("Reset %d tasks", res.RowsAffected), nil)
}

// GetWorkerDomains returns a list of domains for the worker to use (Blacklist/Disposable)
func GetWorkerDomains(c *gin.Context) {
	var domains []model.Domain
	if err := config.DB.Where("excluded = ?", false).Find(&domains).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch domains", "")
		return
	}

	helper.SendSuccess(c, "Domains retrieved", domains)
}

// WorkerAuthMiddleware validates requests from workers using SHA-256 tokens stored in settings
func WorkerAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		rawKey := ""

		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if strings.HasPrefix(authHeader, "Bearer ") {
			rawKey = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		}
		if rawKey == "" {
			rawKey = strings.TrimSpace(c.GetHeader("X-Worker-Key"))
		}

		if rawKey == "" {
			helper.SendError(c, http.StatusUnauthorized, "Unauthorized worker access. Worker API key missing.", "ERR_WORKER_KEY_MISSING")
			c.Abort()
			return
		}

		envPlainKey := strings.TrimSpace(os.Getenv("WORKER_API_KEY"))

		// Fast path for the normal runtime case: worker and API share the same env key.
		if envPlainKey != "" && subtle.ConstantTimeCompare([]byte(rawKey), []byte(envPlainKey)) == 1 {
			c.Next()
			return
		}

		expectedHash, encryptedKey := getWorkerAuthSettings()

		// Legacy hashing: sha256("worker-key|" + key)
		legacySum := sha256.Sum256([]byte("worker-key|" + rawKey))
		legacyHash := hex.EncodeToString(legacySum[:])

		// Backwards compatibility: some early migrations used sha256(key)
		rawSum := sha256.Sum256([]byte(rawKey))
		rawHash := hex.EncodeToString(rawSum[:])

		// Debugging (Internal use only)
		// logger.Debug("Worker Auth Check", "received_prefix", rawKey[:8], "expected_env_prefix", envPlainKey[:8])

		// 1. Check against DB Hash
		if expectedHash != "" {
			if subtle.ConstantTimeCompare([]byte(expectedHash), []byte(legacyHash)) == 1 ||
				subtle.ConstantTimeCompare([]byte(expectedHash), []byte(rawHash)) == 1 {
				c.Next()
				return
			}
		}

		// 2. Fallback: check encrypted setting if exists
		if encryptedKey != "" {
			plain, _ := helper.DecryptSecret(encryptedKey)
			if plain != "" && rawKey == plain {
				c.Next()
				return
			}
		}

		logger.Warn("Worker Auth Failed", "received_key_len", len(rawKey), "expected_key_len", len(envPlainKey))
		helper.SendError(c, http.StatusUnauthorized, "Invalid worker API key.", "ERR_WORKER_KEY_INVALID")
		c.Abort()
	}
}





