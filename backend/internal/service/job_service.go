package service

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"ejp-backend/internal/storage"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/tasks"
	"ejp-backend/internal/verifier"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

var (
	singleLockMap   = make(map[uint64]*sync.Mutex)
	singleLockMapMu sync.Mutex
)

func getSingleMutex(index uint64) *sync.Mutex {
	singleLockMapMu.Lock()
	defer singleLockMapMu.Unlock()
	if lock, exists := singleLockMap[index]; exists {
		return lock
	}
	lock := &sync.Mutex{}
	singleLockMap[index] = lock
	return lock
}

type JobService interface {
	GetJobs(userID uint, jobType string, limit, offset int) ([]model.Job, int64, error)
	GetJobStatus(userID uint, jobID string) (*model.Job, *model.JobResult, error)
	DeleteJob(userID uint, jobID string) error
	VerifySingle(userID uint, email string, apiKeyID *uint) (*model.Job, *model.JobResult, error)
	SubmitBulkJob(userID uint, filename string, emails []string, idempotencyKey string, apiKeyID *uint) (*model.Job, []model.JobTask, error)
	RefundJob(userID uint, jobID string, credits int, reason string) error
	CountActiveJobs(userID uint) (int64, error)
	GetMaxEmailsPerJobLimit() int
	GetJobForUser(userID uint, jobID string) (*model.Job, error)
	GetJobResultsRows(jobInternalID uint) (*sql.Rows, error)
	RetryJob(userID uint, jobID string) (*model.Job, error)
}

type jobService struct {
	jobRepo       repo.JobRepository
	jobResultRepo repo.JobResultRepo
	userRepo      repo.UserRepo
	txRepo        repo.TransactionRepo
	settingsRepo  repo.SettingsRepo
	cacheRepo     repo.CacheRepository
}

func NewJobService(jobRepo repo.JobRepository, jobResultRepo repo.JobResultRepo, userRepo repo.UserRepo, txRepo repo.TransactionRepo, settingsRepo repo.SettingsRepo, cacheRepo repo.CacheRepository) JobService {
	return &jobService{
		jobRepo:       jobRepo,
		jobResultRepo: jobResultRepo,
		userRepo:      userRepo,
		txRepo:        txRepo,
		settingsRepo:  settingsRepo,
		cacheRepo:     cacheRepo,
	}
}

func (s *jobService) GetJobs(userID uint, jobType string, limit, offset int) ([]model.Job, int64, error) {
	return s.jobRepo.List(userID, jobType, limit, offset)
}

func (s *jobService) GetJobStatus(userID uint, jobID string) (*model.Job, *model.JobResult, error) {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return nil, nil, err
	}

	if job.UserID != userID {
		return nil, nil, errors.New("unauthorized")
	}

	var result *model.JobResult
	if job.JobType == "single" {
		results, err := s.jobResultRepo.GetByJobID(job.ID)
		if err == nil && len(results) > 0 {
			result = &results[0]
		}
	}

	return job, result, nil
}

func (s *jobService) DeleteJob(userID uint, jobID string) error {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return err
	}

	if job.UserID != userID {
		return errors.New("unauthorized")
	}

	err = s.jobResultRepo.DeleteByJobID(job.ID)
	if err != nil {
		return err
	}

	return s.jobRepo.Delete(jobID, userID)
}


func (s *jobService) VerifySingle(userID uint, email string, apiKeyID *uint) (*model.Job, *model.JobResult, error) {
	// 1. Get user
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, nil, err
	}

	// 2. Atomic credit deduction BEFORE expensive verification (Prevents Resource Exhaustion / DoS)
	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		// Atomic credit deduction
		creditResult := tx.Model(&model.User{}).
			Where("id = ? AND credits >= ?", user.ID, 1).
			Update("credits", gorm.Expr("credits - ?", 1))
		if creditResult.Error != nil {
			return creditResult.Error
		}
		if creditResult.RowsAffected == 0 {
			return errors.New("insufficient credits")
		}

		// Transaction log
		txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
		transaction := &model.Transaction{
			UserID:        userID,
			TransactionID: txnID,
			Amount:        0,
			CreditsAdded:  -1,
			Type:          "usage",
			Status:        "completed",
			Description:   "Single Verify: " + email,
			Provider:      "system",
		}
		return tx.Create(transaction).Error
	})

	if err != nil {
		return nil, nil, err // Failed to deduct credits
	}

	// 3. Verify email (Check Cache First)
	var res verifier.VerifyResult
	fromCache := false

	b2bRet, freeValidRet, freeInvalidRet := s.getCacheRetentionPolicies()
	cachedResults, err := s.cacheRepo.GetCachedEmailsInBatches([]string{email}, b2bRet, freeValidRet, freeInvalidRet)
	if err == nil {
		if hit, ok := cachedResults[email]; ok {
			fromCache = true
			res = verifier.VerifyResult{
				Status:         hit.Status,
				Score:          hit.Score,
				Deliverable:    hit.IsDeliverable,
				CatchAll:       hit.IsCatchAll,
				MailboxFull:    hit.MailboxFull,
				SyntaxValid:    hit.IsSyntaxValid,
				SMTPConnect:    hit.SmtpConnect,
				HasMX:          hit.HasMx,
				MxRecords:      hit.MxRecords,
				IsFree:         hit.IsFree,
				IsRole:         hit.IsRole,
				IsSpamTrap:     hit.IsSpamTrap,
				IsBlacklisted:  hit.IsBlacklisted,
				ProcessingTime: 0.01, // 10ms for cache hit representation
				Reason:         hit.Reason,
			}
		}
	}

	if !fromCache {
		res = verifier.VerifyEmail(email)
		// Async upsert to cache for future lookups
		resCopy := res
		emailCopy := email
		safe.Go(func() {
			r := resCopy
			e := emailCopy
			cacheRows := []model.EmailCache{{
				Email:          e,
				Status:         r.Status,
				Score:          r.Score,
				Reason:         r.Reason,
				IsCatchAll:     r.CatchAll,
				IsDeliverable:  r.Deliverable,
				IsDisposable:   r.Status == "disposable",
				IsFree:         r.IsFree,
				IsRole:         r.IsRole,
				HasMx:          r.HasMX,
				MxRecords:      r.MxRecords,
				SmtpConnect:    r.SMTPConnect,
				UserExists:     r.Deliverable,
				IsSyntaxValid:  r.SyntaxValid,
				IsSpamTrap:     r.IsSpamTrap,
				IsBlacklisted:  r.IsBlacklisted,
				MailboxFull:    r.MailboxFull,
				ProcessingTime: r.ProcessingTime,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}}
			_ = s.cacheRepo.UpsertEmailCacheBatch(cacheRows)
		})
	}

	// 4. Save Job and JobResult in a separate transaction
	var job *model.Job
	var resultRecord *model.JobResult

	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		// Create Job for tracking
		jobID := "single_" + helper.GenerateRandomHex(5)
		job = &model.Job{
			UserID:         userID,
			JobID:          jobID,
			Email:          email,
			Filename:       "Single Verification",
			Status:         "completed",
			JobType:        "single",
			TotalEmails:    1,
			ProcessedCount: 1,
			APIKeyID:       apiKeyID,
		}

		switch res.Status {
		case "valid":
			job.Deliverable = 1
		case "invalid":
			job.Undeliverable = 1
		case "catch_all":
			job.CatchAll = 1
		case "disposable":
			job.Disposable = 1
		}

		if err := tx.Create(job).Error; err != nil {
			return err
		}

		// Create JobResult
		resultRecord = &model.JobResult{
			JobInternalID:  job.ID,
			Email:          email,
			Status:         res.Status,
			Score:          res.Score,
			IsDeliverable:  res.Deliverable,
			IsCatchAll:     res.CatchAll,
			MailboxFull:    res.MailboxFull,
			IsSyntaxValid:  res.SyntaxValid,
			SmtpConnect:    res.SMTPConnect,
			HasMx:          res.HasMX,
			IsFree:         res.IsFree,
			IsRole:         res.IsRole,
			IsSpamTrap:     res.IsSpamTrap,
			IsBlacklisted:  res.IsBlacklisted,
			ProcessingTime: res.ProcessingTime,
			Reason:         res.Reason,
			MxRecords:      res.MxRecords,
		}
		return tx.Create(resultRecord).Error
	})

	// 5. Refund user if saving the result failed (Server Crash/DB Error)
	if err != nil {
		// Attempt to refund the user since the result couldn't be saved
		_ = s.userRepo.AddCredits(userID, 1, "refund", "Refund: DB Error on Single Verify", "system_refund")
		return nil, nil, errors.New("failed to save verification results, credits have been refunded")
	}

	// 5b. Save single verification result to local NDJSON file for exact legacy parity
	jobCopy := job
	rrCopy := resultRecord
	safe.Go(func() {
		j := jobCopy
		rr := rrCopy
		fileIndex := j.ID / 100000
		singleDir := "./storage/results/single"
		if envPath := os.Getenv("SINGLE_RESULTS_PATH"); envPath != "" {
			singleDir = envPath
		}
		_ = os.MkdirAll(singleDir, 0750)
		resultFile := filepath.Join(singleDir, fmt.Sprintf("single_verifications_%d.ndjson", fileIndex))

		detailedChecks := map[string]interface{}{
			"safeToSend":      rr.IsDeliverable,
			"deliverable":     rr.IsDeliverable,
			"invalidSyntax":   !rr.IsSyntaxValid,
			"disposableEmail": rr.IsDisposable,
			"mxRecords":       rr.HasMx,
			"smtpConnect":     rr.SmtpConnect,
			"userExist":       rr.IsDeliverable,
			"unknown":         rr.Status == "unknown",
			"mailboxFull":     rr.MailboxFull,
			"catchAll":        rr.IsCatchAll,
			"roleAccount":     rr.IsRole,
			"freeAccount":     rr.IsFree,
			"spamTrap":        rr.IsSpamTrap,
			"blacklist":       rr.IsBlacklisted,
		}

		ndjsonRow := map[string]interface{}{
			"email":          rr.Email,
			"status":         rr.Status,
			"score":          rr.Score,
			"processingTime": rr.ProcessingTime,
			"detailedChecks": detailedChecks,
			"jobId":          j.JobID,
		}

		if line, err := json.Marshal(ndjsonRow); err == nil {
			line = append(line, '\n')
			mu := getSingleMutex(uint64(fileIndex))
			mu.Lock()
			if f, err := os.OpenFile(resultFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640); err == nil {
				_, _ = f.Write(line)
				f.Close()
			}
			mu.Unlock()
		}
	})

	// Broadcast updated credit balance and clear cache
	if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	go ComputeAndCacheDashboardStats(userID)

	return job, resultRecord, nil
}

type IdempotencyError struct {
	JobID  string
	Total  int
	Queued int
	Status string
}

func (e *IdempotencyError) Error() string {
	return "job already submitted (idempotent)"
}

func (s *jobService) SubmitBulkJob(userID uint, filename string, emails []string, idempotencyKey string, apiKeyID *uint) (*model.Job, []model.JobTask, error) {
	// Deduplicate
	uniqueEmails := make([]string, 0)
	seen := make(map[string]bool)
	for _, email := range emails {
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
	if totalEmails == 0 {
		return nil, nil, errors.New("no valid emails provided")
	}

	// 1. Max Limit check
	maxLimit := 100000
	if limitSetting, err := s.settingsRepo.GetByKey("max_emails_per_job"); err == nil {
		if v, convErr := strconv.Atoi(limitSetting.SettingValue); convErr == nil && v > 0 {
			maxLimit = v
		}
	}
	if totalEmails > maxLimit {
		return nil, nil, fmt.Errorf("bulk jobs are limited to %d emails", maxLimit)
	}

	// 2. Check active jobs limit
	maxActiveJobs := 0
	if activeSetting, err := s.settingsRepo.GetByKey("max_active_jobs_per_user"); err == nil {
		if v, convErr := strconv.Atoi(activeSetting.SettingValue); convErr == nil && v > 0 {
			maxActiveJobs = v
		}
	}
	if maxActiveJobs > 0 {
		activeJobsCount, err := s.jobRepo.CountActiveJobs(userID)
		if err == nil && activeJobsCount >= int64(maxActiveJobs) {
			return nil, nil, fmt.Errorf("you already have %d active jobs. limit is %d", activeJobsCount, maxActiveJobs)
		}
	}

	// 3. Idempotency Check & Atomic Lock
	var lockReleased = false
	if idempotencyKey != "" {
		redisKey := fmt.Sprintf("idempotency:job:%s", idempotencyKey)
		// We set it to "in_progress" with a 60 second TTL to prevent deadlocks in case of unexpected crashes
		success, err := config.Redis.SetNX(config.Ctx, redisKey, "in_progress", 60*time.Second).Result()
		if err != nil {
			logger.Warn("Redis error during idempotency check", "error", err)
		} else if !success {
			// If lock acquisition failed, check if the job is already completed or in progress
			val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
			if val == "in_progress" {
				return nil, nil, errors.New("a request with this idempotency key is already in progress")
			} else if val != "" {
				existingJob, err := s.jobRepo.GetByID(val)
				if err == nil {
					return nil, nil, &IdempotencyError{
						JobID:  existingJob.JobID,
						Total:  existingJob.TotalEmails,
						Queued: existingJob.TotalEmails - existingJob.InvalidSyntax,
						Status: existingJob.Status,
					}
				}
			}
			return nil, nil, errors.New("duplicate request detected")
		}

		// Ensure we release the lock if the function exits early with an error
		defer func() {
			if !lockReleased {
				val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
				if val == "in_progress" {
					config.Redis.Del(config.Ctx, redisKey)
				}
			}
		}()
	}

	// 4. Check user
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, nil, errors.New("user not found")
	}

	// 5. Pre-filter basic syntax
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

	// C3 Fix: DO NOT do a non-atomic credit pre-check here (race condition).
	// The definitive atomic credit deduction happens inside CreateBulkJob repo
	// via: UPDATE users SET credits = credits - N WHERE id = ? AND credits >= N
	// That single DB operation is the only source of truth for credit sufficiency.

	// Check Redis health
	if err := config.Redis.Ping(config.Ctx).Err(); err != nil {
		logger.Error("Redis unavailable, refusing job submission", "error", err)
		return nil, nil, errors.New("job queue is temporarily unavailable. Please try again.")
	}

	legacyJobID := fmt.Sprintf("job_%x%s", time.Now().Unix(), helper.GenerateRandomHex(8))

	var taskRecords []model.JobTask
	chunkSize := 1000
	if chunkSetting, err := s.settingsRepo.GetByKey("chunk_size"); err == nil {
		if v, convErr := strconv.Atoi(chunkSetting.SettingValue); convErr == nil && v > 0 {
			chunkSize = v
		}
	}
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
		taskRecords = append(taskRecords, taskRecord)
	}

	job, savedTasks, err := s.jobRepo.CreateBulkJob(userID, legacyJobID, filename, totalEmails, invalidSyntax, queuedCount, taskRecords, apiKeyID)
	if err != nil {
		return nil, nil, err
	}

	// Save original deduplicated emails to source file for retry capability
	jobIDCopy := legacyJobID
	emailsCopy := uniqueEmails
	safe.Go(func() {
		jobID := jobIDCopy
		emails := emailsCopy
		basePath := os.Getenv("BULK_JOBS_PATH")
		if basePath == "" {
			basePath = "./storage/bulk_jobs"
		}
		_ = os.MkdirAll(basePath, 0750)
		sourceFile := filepath.Join(basePath, jobID+"_source.txt")
		f, err := os.OpenFile(sourceFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
		if err == nil {
			writer := bufio.NewWriter(f)
			for _, email := range emails {
				_, _ = writer.WriteString(email + "\n")
			}
			_ = writer.Flush()
			f.Close()
		}
	})

	// Enqueue in parallel
	var enqueuedCount int32
	var enqueueErrors int32
	numWorkers := 10
	chunksChan := make(chan int, len(savedTasks))
	var wg sync.WaitGroup

	// Fetch cache retention policies ONCE — shared across all chunk goroutines
	b2bRet, freeValidRet, freeInvalidRet := s.getCacheRetentionPolicies()

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		safe.Go(func() {
			defer wg.Done()
			for taskIdx := range chunksChan {
				currentTask := savedTasks[taskIdx]
				
				// Extract the slice of emails for this chunk
				if currentTask.StartIndex >= len(queueEmails) {
					continue
				}
				endIndex := currentTask.EndIndex
				if endIndex >= len(queueEmails) {
					endIndex = len(queueEmails) - 1
				}
				chunkEmails := queueEmails[currentTask.StartIndex : endIndex+1]

				// 1. CACHE CHECK (retention policies fetched once above the pool)
				cachedResults, err := s.cacheRepo.GetCachedEmailsInBatches(chunkEmails, b2bRet, freeValidRet, freeInvalidRet)
				if err != nil {
					logger.Error("Cache check error", "error", err)
					cachedResults = make(map[string]model.EmailCache)
				}

				var misses []string
				var hits []model.EmailCache
				for _, email := range chunkEmails {
					if hit, ok := cachedResults[email]; ok {
						hits = append(hits, hit)
					} else {
						misses = append(misses, email)
					}
				}

				// 2. Process Hits
				if len(hits) > 0 {
					s.processCacheHits(legacyJobID, job.ID, currentTask.ID, hits)
				}

				// 3. Enqueue Misses
				if len(misses) > 0 {
					task, _ := tasks.NewEmailChunkTask(legacyJobID, currentTask.ID, misses)
					if _, err := config.AsynqClient.Enqueue(task, asynq.MaxRetry(3)); err != nil {
						logger.Error("Failed to enqueue chunk task", "job_id", legacyJobID, "task_id", currentTask.ID, "error", err)
						atomic.AddInt32(&enqueueErrors, 1)
					} else {
						atomic.AddInt32(&enqueuedCount, int32(len(misses)))
					}
				} else {
					// All emails were cache hits, technically enqueued 0 misses, but we don't count it as an error.
					// We can just increment enqueuedCount by the hits to avoid triggering the error refund below.
					atomic.AddInt32(&enqueuedCount, int32(len(hits)))
				}
			}
		})
	}

	for i := 0; i < len(savedTasks); i++ {
		chunksChan <- i
	}
	close(chunksChan)
	wg.Wait()

	finalEnqueuedCount := int(enqueuedCount)
	finalEnqueueErrors := int(enqueueErrors)

	if finalEnqueueErrors > 0 || finalEnqueuedCount == 0 {
		_ = s.RefundJob(userID, legacyJobID, queuedCount, fmt.Sprintf("%d/%d failed to queue", finalEnqueueErrors, queuedCount))
		return nil, nil, errors.New("failed to queue some emails for processing. The entire job has been cancelled and credits refunded.")
	}

	// Trigger Webhook
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

	// Real-time Update
	if updatedUser, err := s.userRepo.GetByID(user.ID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}

	go ComputeAndCacheDashboardStats(user.ID)
	if idempotencyKey != "" {
		redisKey := fmt.Sprintf("idempotency:job:%s", idempotencyKey)
		config.Redis.Set(config.Ctx, redisKey, legacyJobID, 24*time.Hour)
		lockReleased = true
	}

	return job, savedTasks, nil
}

func (s *jobService) RefundJob(userID uint, jobID string, credits int, reason string) error {
	description := fmt.Sprintf("Full refund: job %s queue failure. Reason: %s", jobID, reason)
	return s.jobRepo.RefundBulkJob(userID, jobID, credits, description)
}

func (s *jobService) CountActiveJobs(userID uint) (int64, error) {
	return s.jobRepo.CountActiveJobs(userID)
}

func (s *jobService) GetMaxEmailsPerJobLimit() int {
	maxLimit := 100000
	if limitSetting, err := s.settingsRepo.GetByKey("max_emails_per_job"); err == nil {
		if v, convErr := strconv.Atoi(limitSetting.SettingValue); convErr == nil && v > 0 {
			maxLimit = v
		}
	}
	return maxLimit
}

func (s *jobService) GetJobForUser(userID uint, jobID string) (*model.Job, error) {
	return s.jobRepo.GetJobForUser(userID, jobID)
}

func (s *jobService) GetJobResultsRows(jobInternalID uint) (*sql.Rows, error) {
	return s.jobRepo.GetJobResultsRows(jobInternalID)
}

func (s *jobService) processCacheHits(jobID string, jobInternalID uint, taskID uint, hits []model.EmailCache) {
	if len(hits) == 0 {
		return
	}

	deliverableInc := 0
	undeliverableInc := 0
	riskyInc := 0
	catchAllInc := 0
	disposableInc := 0
	roleInc := 0

	var newRows []model.JobResult
	for _, hit := range hits {
		status := hit.Status
		switch status {
		case "valid":
			deliverableInc++
		case "invalid":
			undeliverableInc++
		case "unknown":
			riskyInc++
		case "catch_all":
			catchAllInc++
		case "disposable":
			disposableInc++
		}

		if hit.IsCatchAll && status != "catch_all" {
			catchAllInc++
		}
		if hit.IsDisposable && status != "disposable" {
			disposableInc++
		}
		if hit.IsRole {
			roleInc++
		}

		newRows = append(newRows, model.JobResult{
			JobInternalID:  jobInternalID,
			Email:          hit.Email,
			Status:         hit.Status,
			Score:          hit.Score,
			Reason:         hit.Reason,
			IsDisposable:   hit.IsDisposable,
			IsFree:         hit.IsFree,
			IsRole:         hit.IsRole,
			HasMx:          hit.HasMx,
			MxRecords:      hit.MxRecords,
			SmtpConnect:    hit.SmtpConnect,
			UserExists:     hit.UserExists,
			IsCatchAll:     hit.IsCatchAll,
			IsDeliverable:  hit.IsDeliverable,
			IsSyntaxValid:  hit.IsSyntaxValid,
			IsSpamTrap:     hit.IsSpamTrap,
			IsBlacklisted:  hit.IsBlacklisted,
			MailboxFull:    hit.MailboxFull,
			ProcessingTime: hit.ProcessingTime,
		})
	}

	processedCount := len(hits)

	err := s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.CreateInBatches(&newRows, 500).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.Job{}).Where("id = ?", jobInternalID).Updates(map[string]interface{}{
			"processed_count": gorm.Expr("processed_count + ?", processedCount),
			"deliverable":     gorm.Expr("deliverable + ?", deliverableInc),
			"undeliverable":   gorm.Expr("undeliverable + ?", undeliverableInc),
			"risky":           gorm.Expr("risky + ?", riskyInc),
			"catch_all":       gorm.Expr("catch_all + ?", catchAllInc),
			"disposable":      gorm.Expr("disposable + ?", disposableInc),
			"role_accounts":   gorm.Expr("role_accounts + ?", roleInc),
			"status": gorm.Expr(
				"CASE WHEN processed_count + ? >= total_emails THEN 'completed' ELSE 'processing' END",
				processedCount,
			),
		}).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.JobTask{}).Where("id = ?", taskID).Updates(map[string]interface{}{
			"pushed_count": gorm.Expr("LEAST(pushed_count + ?, (end_index - start_index + 1))", processedCount),
			"status": gorm.Expr(
				"CASE WHEN pushed_count + ? >= (end_index - start_index + 1) THEN 'completed' ELSE 'processing' END",
				processedCount,
			),
			"updated_at": time.Now(),
		}).Error; err != nil {
			return err
		}

		// Trigger risky refund check if job completes
		if err := s.jobRepo.CheckAndApplyRiskyRefund(tx, jobID); err != nil {
			logger.Error("Failed to check/apply risky refund on cache hits", "job_id", jobID, "error", err)
		}

		return nil
	})

	if err != nil {
		logger.Error("processCacheHits failed DB transaction", "job", jobID, "error", err)
		return
	}

	// Async NDJSON append
	jobIDCopyForNDJSON := jobID
	newRowsCopy := newRows
	safe.Go(func() {
		jobID := jobIDCopyForNDJSON
		newRows := newRowsCopy
		basePath := os.Getenv("BULK_JOBS_PATH")
		if basePath == "" {
			basePath = "./storage/bulk_jobs"
		}
		storeRows := make([]storage.ResultRow, 0, len(newRows))
		for _, r := range newRows {
			storeRows = append(storeRows, storage.ResultRow{
				JobID:          jobID,
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
		_, err := storage.AppendBatch(basePath, jobID, storeRows)
		if err != nil {
			logger.Error("processCacheHits: failed to append batch to ndjson", "job_id", jobID, "error", err)
		}
	})

	var updatedJob model.Job
	if err := s.jobRepo.DB().Where("job_id = ?", jobID).First(&updatedJob).Error; err == nil {
		ws.GlobalHub.Broadcast <- ws.Message{
			UserID: updatedJob.UserID,
			JobID:  updatedJob.JobID,
			Type:   "job_update",
			Data: gin.H{
				"job_id":          updatedJob.JobID,
				"status":          updatedJob.Status,
				"total_emails":    updatedJob.TotalEmails,
				"processed_count": updatedJob.ProcessedCount,
				"deliverable":     updatedJob.Deliverable,
				"undeliverable":   updatedJob.Undeliverable,
				"risky":           updatedJob.Risky,
				"catch_all":       updatedJob.CatchAll,
				"disposable":      updatedJob.Disposable,
				"role_accounts":   updatedJob.RoleAccounts,
			},
		}
	}
}

var (
	retentionCache struct {
		sync.RWMutex
		b2b, freeValid, freeInvalid int
		expiresAt                   time.Time
	}
)

func (s *jobService) getCacheRetentionPolicies() (b2b, freeValid, freeInvalid int) {
	retentionCache.RLock()
	if time.Now().Before(retentionCache.expiresAt) {
		b, fv, fi := retentionCache.b2b, retentionCache.freeValid, retentionCache.freeInvalid
		retentionCache.RUnlock()
		return b, fv, fi
	}
	retentionCache.RUnlock()

	// Defaults
	b2b, freeValid, freeInvalid = 30, 365, 30

	if setting, err := s.settingsRepo.GetByKey("b2b_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
			b2b = v
		}
	}
	if setting, err := s.settingsRepo.GetByKey("free_valid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
			freeValid = v
		}
	}
	if setting, err := s.settingsRepo.GetByKey("free_invalid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
			freeInvalid = v
		}
	}

	retentionCache.Lock()
	retentionCache.b2b = b2b
	retentionCache.freeValid = freeValid
	retentionCache.freeInvalid = freeInvalid
	retentionCache.expiresAt = time.Now().Add(5 * time.Minute)
	retentionCache.Unlock()

	return
}

func (s *jobService) RetryJob(userID uint, jobID string) (*model.Job, error) {
	// 1. Get job
	job, err := s.jobRepo.GetJobForUser(userID, jobID)
	if err != nil {
		return nil, errors.New("job not found")
	}

	// Only failed jobs can be retried
	if job.Status != "failed" {
		return nil, errors.New("only failed jobs can be retried")
	}

	// 2. Read source emails
	basePath := os.Getenv("BULK_JOBS_PATH")
	if basePath == "" {
		basePath = "./storage/bulk_jobs"
	}
	sourceFilePath := filepath.Join(basePath, job.JobID+"_source.txt")
	
	// Check if source file exists
	if _, err := os.Stat(sourceFilePath); os.IsNotExist(err) {
		return nil, errors.New("original source file not found, cannot retry job. Please re-upload your list.")
	}

	file, err := os.Open(sourceFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open source file: %v", err)
	}
	defer file.Close()

	var sourceEmails []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		email := strings.TrimSpace(scanner.Text())
		if email != "" {
			sourceEmails = append(sourceEmails, email)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading source file: %v", err)
	}

	// 3. Find already verified emails
	var verifiedEmails []string
	err = s.jobRepo.DB().Model(&model.JobResult{}).Where("job_internal_id = ?", job.ID).Pluck("email", &verifiedEmails).Error
	if err != nil {
		return nil, fmt.Errorf("failed to fetch existing results: %v", err)
	}

	verifiedMap := make(map[string]bool)
	for _, e := range verifiedEmails {
		verifiedMap[e] = true
	}

	// Filter remaining emails
	var remainingEmails []string
	for _, e := range sourceEmails {
		if !verifiedMap[e] {
			remainingEmails = append(remainingEmails, e)
		}
	}

	if len(remainingEmails) == 0 {
		// All emails already verified, just mark as completed
		job.Status = "completed"
		if err := s.jobRepo.DB().Save(job).Error; err != nil {
			return nil, err
		}
		return job, nil
	}

	// 4. Calculate credit deduction
	// Check if any refund transactions exist for this job
	var refundTxns []model.Transaction
	refundSearch := "%" + job.JobID + "%"
	s.jobRepo.DB().Where("user_id = ? AND type = 'refund' AND description LIKE ?", userID, refundSearch).Find(&refundTxns)
	
	refundedCredits := 0
	for _, tx := range refundTxns {
		// CreditsAdded is positive for refund transactions
		refundedCredits += tx.CreditsAdded
	}

	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, errors.New("user not found")
	}

	creditsToDeduct := refundedCredits
	if creditsToDeduct > 0 {
		if user.Credits < creditsToDeduct {
			return nil, fmt.Errorf("insufficient credits to retry. Need %d credits, have %d", creditsToDeduct, user.Credits)
		}
	}

	// 5. Database transaction to update job and recreate tasks
	var savedTasks []model.JobTask
	chunkSize := 1000
	if chunkSetting, err := s.settingsRepo.GetByKey("chunk_size"); err == nil {
		if v, convErr := strconv.Atoi(chunkSetting.SettingValue); convErr == nil && v > 0 {
			chunkSize = v
		}
	}

	var taskRecords []model.JobTask
	for i := 0; i < len(remainingEmails); i += chunkSize {
		end := i + chunkSize - 1
		if end >= len(remainingEmails) {
			end = len(remainingEmails) - 1
		}
		taskRecord := model.JobTask{
			JobID:      job.JobID,
			StartIndex: i,
			EndIndex:   end,
			Status:     "queued",
		}
		taskRecords = append(taskRecords, taskRecord)
	}

	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		// Deduct credits if necessary
		if creditsToDeduct > 0 {
			res := tx.Model(&model.User{}).
				Where("id = ? AND credits >= ?", userID, creditsToDeduct).
				Update("credits", gorm.Expr("credits - ?", creditsToDeduct))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return fmt.Errorf("insufficient credits")
			}

			// Add transaction log
			txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(6))
			transaction := model.Transaction{
				UserID:        userID,
				TransactionID: txnID,
				Amount:        0,
				CreditsAdded:  -creditsToDeduct,
				Type:          "bulk_verify_retry",
				Status:        "completed",
				Description:   fmt.Sprintf("Retry Job: %s (%d emails resumed)", job.Filename, len(remainingEmails)),
			}
			if err := tx.Create(&transaction).Error; err != nil {
				return err
			}
		}

		// Hard delete old job tasks
		if err := tx.Unscoped().Where("job_id = ?", job.JobID).Delete(&model.JobTask{}).Error; err != nil {
			return err
		}

		// Save new job tasks
		for i := range taskRecords {
			if err := tx.Create(&taskRecords[i]).Error; err != nil {
				return err
			}
			savedTasks = append(savedTasks, taskRecords[i])
		}

		// Update Job status and processed count
		// processed_count is set to (Total - remaining)
		processedCount := job.TotalEmails - len(remainingEmails)
		if err := tx.Model(job).Updates(map[string]interface{}{
			"status":          "pending",
			"processed_count": processedCount,
		}).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// 6. Enqueue tasks in parallel
	var enqueuedCount int32
	var enqueueErrors int32
	numWorkers := 10
	chunksChan := make(chan int, len(savedTasks))
	var wg sync.WaitGroup

	b2bRet, freeValidRet, freeInvalidRet := s.getCacheRetentionPolicies()

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		safe.Go(func() {
			defer wg.Done()
			for taskIdx := range chunksChan {
				currentTask := savedTasks[taskIdx]
				
				if currentTask.StartIndex >= len(remainingEmails) {
					continue
				}
				endIndex := currentTask.EndIndex
				if endIndex >= len(remainingEmails) {
					endIndex = len(remainingEmails) - 1
				}
				chunkEmails := remainingEmails[currentTask.StartIndex : endIndex+1]

				// Cache Check
				cachedResults, err := s.cacheRepo.GetCachedEmailsInBatches(chunkEmails, b2bRet, freeValidRet, freeInvalidRet)
				if err != nil {
					cachedResults = make(map[string]model.EmailCache)
				}

				var misses []string
				var hits []model.EmailCache
				for _, email := range chunkEmails {
					if hit, ok := cachedResults[email]; ok {
						hits = append(hits, hit)
					} else {
						misses = append(misses, email)
					}
				}

				// Process Hits
				if len(hits) > 0 {
					s.processCacheHits(job.JobID, job.ID, currentTask.ID, hits)
				}

				// Enqueue Misses
				if len(misses) > 0 {
					task, _ := tasks.NewEmailChunkTask(job.JobID, currentTask.ID, misses)
					if _, err := config.AsynqClient.Enqueue(task, asynq.MaxRetry(3)); err != nil {
						logger.Error("Failed to enqueue chunk task on retry", "job_id", job.JobID, "task_id", currentTask.ID, "error", err)
						atomic.AddInt32(&enqueueErrors, 1)
					} else {
						atomic.AddInt32(&enqueuedCount, int32(len(misses)))
					}
				} else {
					atomic.AddInt32(&enqueuedCount, int32(len(hits)))
				}
			}
		})
	}

	for i := 0; i < len(savedTasks); i++ {
		chunksChan <- i
	}
	close(chunksChan)
	wg.Wait()

	// Update user credit update broadcast
	if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	go ComputeAndCacheDashboardStats(userID)

	return job, nil
}

