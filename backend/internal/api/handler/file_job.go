package handler

import (
	"bufio"
	"fmt"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/tasks"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/logger"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

func SubmitBulkJob(c *gin.Context) {
	userID, _ := c.Get("userID")
	contentType := c.GetHeader("Content-Type")

	var sourceEmails []string
	var sourceCount int
	var filename string
	var idempotencyKey string

	// 1. Extract emails based on Content-Type
	if strings.Contains(contentType, "application/json") {
		var input struct {
			Emails         []string `json:"emails" binding:"required"`
			IdempotencyKey string   `json:"idempotencyKey"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			helper.SendError(c, http.StatusBadRequest, "Invalid JSON payload or missing emails array.", "ERR_INVALID_JSON")
			return
		}
		sourceEmails = input.Emails
		sourceCount = len(input.Emails)
		filename = "JSON Submission"
		idempotencyKey = input.IdempotencyKey
	} else {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			helper.SendError(c, http.StatusBadRequest, "File upload or JSON array is required.", "ERR_FILE_REQUIRED")
			return
		}

		file, err := fileHeader.Open()
		if err != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to open uploaded file.", "")
			return
		}
		defer file.Close()

		sourceEmails, sourceCount = extractEmailsWithSourceCount(file)
		filename = fileHeader.Filename
		idempotencyKey = c.Request.Header.Get("X-Idempotency-Key")
		if idempotencyKey == "" {
			idempotencyKey = c.PostForm("idempotencyKey")
		}
	}

	// 2. Deduplicate
	uniqueEmails := make([]string, 0)
	seen := make(map[string]bool)
	for _, email := range sourceEmails {
		email = strings.ToLower(strings.TrimSpace(email))
		if email == "" {
			continue
		}
		if !seen[email] {
			seen[email] = true
			uniqueEmails = append(uniqueEmails, email)
		}
	}

	totalEmails := len(uniqueEmails)
	duplicatesRemoved := sourceCount - totalEmails

	if totalEmails == 0 {
		helper.SendError(c, http.StatusBadRequest, "No valid emails provided.", "ERR_NO_EMAILS")
		return
	}

	// Legacy Parity: Get max limit from settings
	maxLimit := 100000
	var limitSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "max_emails_per_job").First(&limitSetting).Error; err == nil {
		if v, convErr := strconv.Atoi(limitSetting.SettingValue); convErr == nil && v > 0 {
			maxLimit = v
		}
	}

	if totalEmails > maxLimit {
		helper.SendError(c, http.StatusBadRequest, fmt.Sprintf("Bulk jobs are limited to %d emails.", maxLimit), "ERR_LIMIT_EXCEEDED")
		return
	}

	// 3. Check active jobs limit
	var maxActiveJobs int
	var activeSetting model.Setting
	if err := config.DB.Where("setting_key = ?", "max_active_jobs_per_user").First(&activeSetting).Error; err == nil {
		maxActiveJobs, _ = strconv.Atoi(activeSetting.SettingValue)
	}

	if maxActiveJobs > 0 {
		var activeJobsCount int64
		config.DB.Model(&model.Job{}).Where("user_id = ? AND type = 'bulk' AND status IN ('pending', 'processing')", userID).Count(&activeJobsCount)
		if activeJobsCount >= int64(maxActiveJobs) {
			helper.SendError(c, http.StatusTooManyRequests, fmt.Sprintf("You already have %d active jobs. Limit is %d.", activeJobsCount, maxActiveJobs), "ERR_ACTIVE_JOBS_LIMIT")
			return
		}
	}

	// 4. Idempotency Check
	if idempotencyKey != "" {
		redisKey := fmt.Sprintf("idempotency:job:%s", idempotencyKey)
		existingJobID, _ := config.Redis.Get(config.Ctx, redisKey).Result()
		if existingJobID != "" {
			var existingJob model.Job
			if err := config.DB.Where("job_id = ?", existingJobID).First(&existingJob).Error; err == nil {
				helper.SendSuccess(c, "Job already submitted (idempotent)", gin.H{
					"jobId":        existingJob.JobID,
					"total":        existingJob.TotalEmails,
					"queued":       existingJob.TotalEmails - existingJob.InvalidSyntax,
					"status":       existingJob.Status,
					"is_duplicate": true,
				})
				return
			}
		}
	}

	// 5. Check credits
	var user model.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		helper.SendError(c, http.StatusUnauthorized, "User not found", "ERR_USER_NOT_FOUND")
		return
	}

	// Pre-filter basic syntax
	queueEmails := make([]string, 0)
	invalidSyntax := 0
	for _, email := range uniqueEmails {
		if !strings.Contains(email, "@") || len(email) < 5 {
			invalidSyntax++
			continue
		}
		queueEmails = append(queueEmails, email)
	}

	queuedCount := len(queueEmails)
	if user.Credits < queuedCount {
		helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits for this job.", "ERR_INSUFFICIENT_CREDITS")
		return
	}

	// 6. Create Job in Transaction
	legacyJobID := fmt.Sprintf("job_%x%s", time.Now().Unix(), helper.GenerateRandomHex(8))
	var taskRecords []model.JobTask

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Deduct Credits
		if err := tx.Model(&model.User{}).Where("id = ?", user.ID).Update("credits", gorm.Expr("credits - ?", queuedCount)).Error; err != nil {
			return err
		}

		// Transaction Log
		transaction := model.Transaction{
			UserID:        user.ID,
			TransactionID: fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(6)),
			Amount:        0,
			CreditsAdded:  -queuedCount,
			Type:          "bulk_verify",
			Status:        "completed",
			Description:   fmt.Sprintf("Bulk verification: %s (%d emails)", filename, queuedCount),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			return err
		}

		// Job Record
		jobStatus := "pending"
		if queuedCount == 0 {
			jobStatus = "completed"
		}

		job := model.Job{
			UserID:         user.ID,
			JobID:          legacyJobID,
			JobType:        "bulk",
			Status:         jobStatus,
			Filename:       filename,
			TotalEmails:    totalEmails,
			ProcessedCount: invalidSyntax,
			InvalidSyntax:  invalidSyntax,
			Undeliverable:  invalidSyntax,
		}
		if err := tx.Create(&job).Error; err != nil {
			return err
		}

		// Create JobTasks in chunks (SQL insertion only)
		chunkSize := 1000
		for i := 0; i < queuedCount; i += chunkSize {
			end := i + chunkSize - 1
			if end >= queuedCount {
				end = queuedCount - 1
			}
			taskRecord := model.JobTask{
				JobID:      legacyJobID,
				StartIndex: i,
				EndIndex:   end,
				Status:     "queued",
			}
			if err := tx.Create(&taskRecord).Error; err != nil {
				return err
			}
			taskRecords = append(taskRecords, taskRecord)
		}
		return nil
	})

	if err != nil {
		logger.Error("Failed to create bulk job transaction", "user_id", userID, "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to create bulk job in database.", err.Error())
		return
	}

	logger.Info("Job transaction committed successfully", "job_id", legacyJobID)

	// 7. Enqueue to Asynq OUTSIDE of the SQL transaction (Enterprise optimization)
	go func(jobID string, tasksList []model.JobTask, emails []string) {
		logger.Info("Starting background enqueuing", "job_id", jobID, "count", len(emails))
		for idx, email := range emails {
			var currentTaskID uint
			for _, tr := range tasksList {
				if idx >= tr.StartIndex && idx <= tr.EndIndex {
					currentTaskID = tr.ID
					break
				}
			}
			task, _ := tasks.NewEmailVerifyTask(jobID, currentTaskID, email)
			if _, err := config.AsynqClient.Enqueue(task, asynq.MaxRetry(3)); err != nil {
				logger.Error("Failed to enqueue task", "job_id", jobID, "error", err)
			}
		}
		logger.Info("Finished background enqueuing", "job_id", jobID)
	}(legacyJobID, taskRecords, queueEmails)

	// Trigger Webhook for job.started
	if user.WebhookURL != "" {
		webhookData := map[string]interface{}{
			"job_id":       legacyJobID,
			"event":        "job.started",
			"status":       "processing",
			"total_emails": totalEmails,
			"filename":     filename,
			"timestamp":    time.Now().Format(time.RFC3339),
		}
		task, err := tasks.NewWebhookDeliverTask(user.WebhookURL, user.WebhookSecret, "job.started", webhookData)
		if err == nil {
			config.AsynqClient.Enqueue(task, asynq.MaxRetry(5), asynq.Queue("low"))
			logger.Info("Webhook enqueued", "job_id", legacyJobID, "event", "job.started", "user_id", user.ID)
		}
	}

	// Real-time Update for User (Credits)
	var updatedUser model.User
	if err := config.DB.First(&updatedUser, user.ID).Error; err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}

	config.ClearDashboardCache(user.ID)
	if idempotencyKey != "" {
		redisKey := fmt.Sprintf("idempotency:job:%s", idempotencyKey)
		config.Redis.Set(config.Ctx, redisKey, legacyJobID, 24*time.Hour)
	}

	helper.SendSuccess(c, "Job created and pre-processed", gin.H{
		"jobId":              legacyJobID,
		"total":              totalEmails,
		"queued":             queuedCount,
		"pre_filtered":       totalEmails - queuedCount,
		"duplicates_removed": duplicatesRemoved,
	})
}

func extractEmailsWithSourceCount(file multipart.File) ([]string, int) {
	var emails []string
	count := 0
	scanner := bufio.NewScanner(file)
	
	// Create a replacer for common delimiters
	r := strings.NewReplacer(",", " ", ";", " ", "\t", " ", "|", " ")
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		
		// Split by any of the delimiters
		cleanedLine := r.Replace(line)
		parts := strings.Fields(cleanedLine)
		
		for _, part := range parts {
			email := strings.TrimSpace(part)
			if email != "" {
				count++
				// Basic sanity check before adding to raw list
				if strings.Contains(email, "@") {
					emails = append(emails, email)
				}
			}
		}
	}
	return emails, count
}



