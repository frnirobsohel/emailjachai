package service

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"ejp-backend/internal/storage"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/jobcontrol"
	"ejp-backend/internal/model"
	"ejp-backend/internal/pipeline"
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
	"gorm.io/gorm/clause"
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
	DeleteJob(userID uint, jobID string) (refundedCredits int, err error)
	VerifySingle(ctx context.Context, userID uint, email string, apiKeyID *uint, idempotencyKey string) (*model.Job, *model.JobResult, error)
	SubmitBulkJob(userID uint, filename string, emails []string, idempotencyKey string, apiKeyID *uint) (*model.Job, []model.JobTask, error)
	PrepareBulkJob(jobID string) error
	FailPreparingJob(jobID, reason string) error
	RefundJob(userID uint, jobID string, credits int, reason string) error
	CountActiveJobs(userID uint) (int64, error)
	GetMaxEmailsPerJobLimit() int
	GetJobForUser(userID uint, jobID string) (*model.Job, error)
	GetJobResultsRows(jobInternalID uint) (*sql.Rows, error)
	RetryJob(userID uint, jobID string) (*model.Job, error)
	PauseJob(userID uint, jobID string) (*model.Job, error)
	ResumeJob(userID uint, jobID string) (*model.Job, error)
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

func (s *jobService) DeleteJob(userID uint, jobID string) (int, error) {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return 0, errors.New("job not found")
	}

	if job.UserID != userID {
		return 0, errors.New("job not found")
	}

	refunded := 0
	switch job.Status {
	case "completed", "failed":
		// Historical delete — no credit change
		if err := s.jobResultRepo.DeleteByJobID(job.ID); err != nil {
			return 0, err
		}
		if err := s.jobRepo.Delete(jobID, userID); err != nil {
			return 0, err
		}
	case "paused":
		// Soft-stop first so new SMTP work stops while we lock/delete.
		_ = jobcontrol.SetPaused(job.JobID)

		err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
			var locked model.Job
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("job_id = ? AND user_id = ? AND status = ?", job.JobID, userID, "paused").
				First(&locked).Error; err != nil {
				return errors.New("job state changed; refresh and try again")
			}

			// Count under row lock so in-flight reporters (also FOR UPDATE on job) cannot race the refund math.
			var resultCount, unknownCount int64
			if err := tx.Model(&model.JobResult{}).
				Where("job_internal_id = ?", locked.ID).
				Count(&resultCount).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.JobResult{}).
				Where("job_internal_id = ? AND status = ?", locked.ID, "unknown").
				Count(&unknownCount).Error; err != nil {
				return err
			}

			charged := locked.TotalEmails - locked.InvalidSyntax
			if charged < 0 {
				charged = 0
			}
			keep := int(resultCount - unknownCount)
			if keep < 0 {
				keep = 0
			}
			refunded = charged - keep
			if refunded < 0 {
				refunded = 0
			}
			if refunded > charged {
				refunded = charged
			}

			// Block late pushes for any connection that reads after this commit.
			if err := tx.Model(&locked).Update("status", "cancelled").Error; err != nil {
				return err
			}
			if err := tx.Model(&model.JobTask{}).Where("job_id = ?", locked.JobID).
				Update("status", "cancelled").Error; err != nil {
				return err
			}

			if refunded > 0 {
				if err := tx.Model(&model.User{}).Where("id = ?", userID).
					Update("credits", gorm.Expr("credits + ?", refunded)).Error; err != nil {
					return err
				}
				refundTxn := model.Transaction{
					UserID:        userID,
					TransactionID: fmt.Sprintf("REFUND_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4)),
					Amount:        0,
					CreditsAdded:  refunded,
					Type:          "refund",
					Status:        "completed",
					Description:   fmt.Sprintf("Paused job deleted: %s — refunded %d unused credits (%d verified kept)", locked.JobID, refunded, keep),
					Provider:      "system",
				}
				if err := tx.Create(&refundTxn).Error; err != nil {
					return err
				}
			}

			// Same txn as refund — never leave a cancelled job with credits already returned.
			if err := tx.Unscoped().Where("job_id = ?", locked.JobID).Delete(&model.JobTask{}).Error; err != nil {
				return err
			}
			if err := tx.Unscoped().Where("job_internal_id = ?", locked.ID).Delete(&model.JobResult{}).Error; err != nil {
				return err
			}
			return tx.Where("id = ?", locked.ID).Delete(&model.Job{}).Error
		})
		if err != nil {
			return 0, err
		}
	default:
		return 0, errors.New("job can only be deleted after it has completed")
	}

	jobcontrol.ClearPaused(jobID)
	clearBulkSourceRedis(jobID)
	if refunded > 0 {
		if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
			ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
				"credits": updatedUser.Credits,
			})
		}
	}
	InvalidateAndRefreshDashboardStats(userID)
	return refunded, nil
}

func (s *jobService) VerifySingle(ctx context.Context, userID uint, email string, apiKeyID *uint, idempotencyKey string) (*model.Job, *model.JobResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	email = strings.ToLower(strings.TrimSpace(email))
	idempotencyKey = strings.TrimSpace(idempotencyKey)

	// Idempotency: prevent double-charge on retries / double-submit
	var lockReleased bool
	var redisKey string
	if idempotencyKey != "" && config.Redis != nil {
		redisKey = fmt.Sprintf("idempotency:single:%d:%s", userID, idempotencyKey)
		success, err := config.Redis.SetNX(config.Ctx, redisKey, "in_progress", 90*time.Second).Result()
		if err != nil {
			logger.Warn("Redis error during single-verify idempotency check", "error", err)
		} else if !success {
			val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
			if val == "in_progress" {
				return nil, nil, errors.New("a request with this idempotency key is already in progress")
			}
			if val != "" {
				existingJob, err := s.jobRepo.GetByID(val)
				if err == nil && existingJob.UserID == userID {
					var result *model.JobResult
					results, rErr := s.jobResultRepo.GetByJobID(existingJob.ID)
					if rErr == nil && len(results) > 0 {
						result = &results[0]
					}
					return existingJob, result, nil
				}
			}
			return nil, nil, errors.New("duplicate request detected")
		}
		defer func() {
			if !lockReleased && redisKey != "" {
				val, _ := config.Redis.Get(config.Ctx, redisKey).Result()
				if val == "in_progress" {
					config.Redis.Del(config.Ctx, redisKey)
				}
			}
		}()
	}

	// 1. Get user
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, nil, err
	}

	// 2. Atomic credit deduction BEFORE expensive verification (Prevents Resource Exhaustion / DoS)
	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		creditResult := tx.Model(&model.User{}).
			Where("id = ? AND credits >= ?", user.ID, 1).
			Update("credits", gorm.Expr("credits - ?", 1))
		if creditResult.Error != nil {
			return creditResult.Error
		}
		if creditResult.RowsAffected == 0 {
			return errors.New("insufficient credits")
		}

		txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
		transaction := &model.Transaction{
			UserID:        userID,
			TransactionID: txnID,
			Amount:        0,
			CreditsAdded:  -1,
			Type:          "usage",
			Status:        "completed",
			Description:   "Single Verify",
			Provider:      "system",
		}
		return tx.Create(transaction).Error
	})

	if err != nil {
		return nil, nil, err
	}

	creditsDeducted := true
	refundSingle := func(reason string) {
		if !creditsDeducted {
			return
		}
		if rErr := s.userRepo.AddCredits(userID, 1, "refund", reason, "system_refund"); rErr != nil {
			logger.Error("Failed to refund single verify credits", "user_id", userID, "error", rErr)
			return
		}
		creditsDeducted = false
		if updatedUser, uErr := s.userRepo.GetByID(userID); uErr == nil {
			ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
				"credits": updatedUser.Credits,
			})
		}
		InvalidateAndRefreshDashboardStats(userID)
	}

	// Reflect deduction immediately (before slow SMTP) so UI/stats never stick on stale cache
	if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	InvalidateAndRefreshDashboardStats(userID)

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
				ProcessingTime: 0.01,
				Reason:         hit.Reason,
			}
		}
	}

	if !fromCache {
		singleTimeout := 20 * time.Second
		if v := strings.TrimSpace(os.Getenv("SINGLE_VERIFY_TIMEOUT_SEC")); v != "" {
			if parsed, pErr := strconv.Atoi(v); pErr == nil && parsed > 0 {
				singleTimeout = time.Duration(parsed) * time.Second
			}
		}
		singleCtx, singleCancel := context.WithTimeout(ctx, singleTimeout)
		res = verifier.VerifyEmailBounded(singleCtx, email, singleTimeout)
		singleCancel()
		if res.Reason == "timeout" || res.Reason == "busy" || res.Reason == "cancelled" {
			refundSingle("Refund: Single Verify timeout/busy")
			if res.Reason == "busy" {
				return nil, nil, errors.New("verification busy")
			}
			return nil, nil, errors.New("verification timed out")
		}
		resCopy := res
		emailCopy := email
		// G2 Fix: Do NOT cache unknown/timeout/inconclusive results.
		// These must be re-probed fresh on the next request.
		if res.Status != "unknown" {
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
	}

	isDisposable := res.Status == "disposable"
	if fromCache {
		if hit, ok := cachedResults[email]; ok && hit.IsDisposable {
			isDisposable = true
		}
	}

	// 4. Save Job and JobResult in a separate transaction
	var job *model.Job
	var resultRecord *model.JobResult

	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
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
		case "unknown":
			job.Risky = 1
		}
		if res.IsRole {
			job.RoleAccounts = 1
		}

		if err := tx.Create(job).Error; err != nil {
			return err
		}

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
			IsDisposable:   isDisposable,
			IsSpamTrap:     res.IsSpamTrap,
			IsBlacklisted:  res.IsBlacklisted,
			ProcessingTime: res.ProcessingTime,
			Reason:         res.Reason,
			MxRecords:      res.MxRecords,
		}
		return tx.Create(resultRecord).Error
	})

	if err != nil {
		refundSingle("Refund: DB Error on Single Verify")
		return nil, nil, errors.New("failed to save verification results, credits have been refunded")
	}

	if redisKey != "" && config.Redis != nil {
		if setErr := config.Redis.Set(config.Ctx, redisKey, job.JobID, 24*time.Hour).Err(); setErr != nil {
			logger.Warn("Failed to persist single-verify idempotency key", "error", setErr)
		} else {
			lockReleased = true
		}
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
			"safeToSend":      helper.IsSafeToSend(rr.Status, rr.IsDeliverable, rr.IsCatchAll),
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

	if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	InvalidateAndRefreshDashboardStats(userID)

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

	// 2. Active jobs limit is enforced atomically inside CreateBulkJob
	maxActiveJobs := 0
	if activeSetting, err := s.settingsRepo.GetByKey("max_active_jobs_per_user"); err == nil {
		if v, convErr := strconv.Atoi(activeSetting.SettingValue); convErr == nil && v > 0 {
			maxActiveJobs = v
		}
	}

	// 3. Idempotency Check & Atomic Lock (scoped per user)
	var lockReleased = false
	if idempotencyKey != "" && config.Redis != nil {
		redisKey := fmt.Sprintf("idempotency:job:%d:%s", userID, idempotencyKey)
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

	// 5. Pre-filter mailbox syntax (exact credit count — invalid_syntax is not charged)
	queueEmails := make([]string, 0)
	invalidSyntax := 0
	for _, email := range uniqueEmails {
		if !helper.IsValidMailboxSyntax(email) {
			invalidSyntax++
			continue
		}
		queueEmails = append(queueEmails, email)
	}
	queuedCount := len(queueEmails)

	// Check Redis health (needed for prepare queue + later verify enqueue)
	if err := config.Redis.Ping(config.Ctx).Err(); err != nil {
		logger.Error("Redis unavailable, refusing job submission", "error", err)
		return nil, nil, errors.New("job queue is temporarily unavailable. Please try again.")
	}

	legacyJobID := fmt.Sprintf("job_%x%s", time.Now().Unix(), helper.GenerateRandomHex(8))

	// Accept-only: credit + job row (status=preparing). Shuffle/chunk/enqueue happen in PrepareBulkJob.
	job, _, err := s.jobRepo.CreateBulkJob(userID, legacyJobID, filename, totalEmails, invalidSyntax, queuedCount, nil, apiKeyID, maxActiveJobs)
	if err != nil {
		return nil, nil, err
	}

	// Source must be on disk (and Redis backup) before prepare task runs.
	if err := s.writeBulkSourceFile(legacyJobID, uniqueEmails); err != nil {
		_ = s.RefundJob(userID, legacyJobID, queuedCount, "failed to persist source file")
		return nil, nil, fmt.Errorf("failed to save job source file (credits refunded): %w", err)
	}
	cacheBulkSourceEmails(legacyJobID, uniqueEmails)

	if queuedCount == 0 {
		// Nothing to prepare/verify
		if idempotencyKey != "" && config.Redis != nil {
			redisKey := fmt.Sprintf("idempotency:job:%d:%s", userID, idempotencyKey)
			config.Redis.Set(config.Ctx, redisKey, legacyJobID, 24*time.Hour)
			lockReleased = true
		}
		if updatedUser, err := s.userRepo.GetByID(user.ID); err == nil {
			ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{"credits": updatedUser.Credits})
		}
		InvalidateAndRefreshDashboardStats(user.ID)
		return job, nil, nil
	}

	prepareTask, err := tasks.NewBulkPrepareTask(legacyJobID)
	if err != nil {
		_ = s.RefundJob(userID, legacyJobID, queuedCount, "failed to build prepare task")
		return nil, nil, errors.New("failed to queue job for preparation")
	}
	if _, err := config.AsynqClient.Enqueue(
		prepareTask,
		asynq.Queue("prepare"),
		asynq.MaxRetry(5),
		asynq.Timeout(2*time.Hour),
		asynq.TaskID("prepare:"+legacyJobID),
	); err != nil {
		logger.Error("Failed to enqueue bulk prepare task", "job_id", legacyJobID, "error", err)
		_ = s.RefundJob(userID, legacyJobID, queuedCount, "failed to enqueue prepare task")
		return nil, nil, errors.New("failed to queue job for preparation")
	}

	if updatedUser, err := s.userRepo.GetByID(user.ID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	InvalidateAndRefreshDashboardStats(user.ID)

	if idempotencyKey != "" && config.Redis != nil {
		redisKey := fmt.Sprintf("idempotency:job:%d:%s", userID, idempotencyKey)
		config.Redis.Set(config.Ctx, redisKey, legacyJobID, 24*time.Hour)
		lockReleased = true
	}

	return job, nil, nil
}

func (s *jobService) writeBulkSourceFile(jobID string, emails []string) error {
	sourcePath := os.Getenv("BULK_SOURCE_PATH")
	if sourcePath == "" {
		sourcePath = "./storage/jobs/bulk"
	}
	if err := os.MkdirAll(sourcePath, 0750); err != nil {
		return err
	}
	sourceFile := filepath.Join(sourcePath, jobID+"_source.txt")
	f, err := os.OpenFile(sourceFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return err
	}
	defer f.Close()
	writer := bufio.NewWriter(f)
	for _, email := range emails {
		if _, err := writer.WriteString(email + "\n"); err != nil {
			return err
		}
	}
	return writer.Flush()
}

// PrepareBulkJob runs after accept: domain shuffle, dynamic chunks, cache/intel, verify enqueue.
// Designed to run with limited concurrency via the Asynq "prepare" queue.
func (s *jobService) PrepareBulkJob(jobID string) error {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return fmt.Errorf("job not found: %w", err)
	}
	if job.JobType != "bulk" {
		return nil
	}

	switch strings.ToLower(job.Status) {
	case "preparing":
		// continue
	case "pending", "processing", "completed":
		// Already prepared / running — idempotent no-op
		return nil
	case "failed":
		// Terminal — stop Asynq retries
		return nil
	default:
		return fmt.Errorf("job %s not in preparing state (%s)", jobID, job.Status)
	}

	// Cross-instance lock (token + TTL refresh). Busy/error → Asynq retries (never silent success).
	releaseLock, lockErr := acquirePrepareJobLock(job.JobID)
	if lockErr != nil {
		return lockErr
	}
	defer releaseLock()

	user, err := s.userRepo.GetByID(job.UserID)
	if err != nil {
		return errors.New("user not found")
	}

	// Stream source file line-by-line — avoids loading the entire list into RAM twice.
	// Syntax filtering happens in the same single pass over the file.
	queueEmails, srcErr := s.streamBulkSourceEmailsFiltered(job.JobID)
	if srcErr != nil {
		queued := job.TotalEmails - job.InvalidSyntax
		if queued < 0 {
			queued = 0
		}
		_ = s.RefundJob(job.UserID, job.JobID, queued, "prepare: source file missing")
		return fmt.Errorf("source file missing: %w", srcErr)
	}

	if len(queueEmails) == 0 {
		_ = s.jobRepo.DB().Model(job).Update("status", "completed").Error
		return nil
	}

	baseChunkSize, _ := s.getChunkStrategyForList(len(queueEmails))
	queueEmails, prepChunks := pipeline.PrepareQueue(queueEmails, baseChunkSize)

	var taskRecords []model.JobTask
	for _, ch := range prepChunks {
		taskRecords = append(taskRecords, model.JobTask{
			JobID:      job.JobID,
			StartIndex: ch.StartIndex,
			EndIndex:   ch.EndIndex,
			Status:     "queued",
		})
	}

	var savedTasks []model.JobTask
	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		// Re-check still preparing (do NOT flip to pending until verify chunks are enqueued —
		// otherwise a crash mid-enqueue leaves a stuck pending job that prepare retries skip).
		var current model.Job
		if err := tx.Where("job_id = ? AND status = ?", job.JobID, "preparing").First(&current).Error; err != nil {
			return errPrepareAlreadyClaimed
		}
		if err := tx.Unscoped().Where("job_id = ?", job.JobID).Delete(&model.JobTask{}).Error; err != nil {
			return err
		}
		for i := range taskRecords {
			if err := tx.Create(&taskRecords[i]).Error; err != nil {
				return err
			}
			savedTasks = append(savedTasks, taskRecords[i])
		}
		return nil
	})
	if errors.Is(err, errPrepareAlreadyClaimed) {
		return nil
	}
	if err != nil {
		queued := len(queueEmails)
		_ = s.RefundJob(job.UserID, job.JobID, queued, "prepare: failed to create tasks")
		return err
	}

	enqueuedOK, err := s.enqueueBulkChunks(job, user, queueEmails, savedTasks, true)
	if err != nil {
		return err
	}
	if !enqueuedOK {
		// Credits refunded / job failed inside enqueueBulkChunks — no webhook
		return nil
	}

	// Only now mark ready for workers / UI as pending
	if err := s.jobRepo.DB().Model(&model.Job{}).
		Where("job_id = ? AND status = ?", job.JobID, "preparing").
		Update("status", "pending").Error; err != nil {
		logger.Error("Failed to mark job pending after prepare", "job_id", job.JobID, "error", err)
	}

	if user.WebhookURL != "" {
		webhookData := map[string]interface{}{
			"job_id":       job.JobID,
			"event":        "job.started",
			"status":       "processing",
			"total_emails": job.TotalEmails,
			"filename":     job.Filename,
			"timestamp":    time.Now().Format(time.RFC3339),
		}
		if task, err := tasks.NewWebhookDeliverTask(user.WebhookURL, user.WebhookSecret, "job.started", webhookData); err == nil {
			_, _ = config.AsynqClient.Enqueue(task, asynq.MaxRetry(5), asynq.Queue("low"))
		}
	}

	InvalidateAndRefreshDashboardStats(user.ID)
	clearBulkSourceRedis(job.JobID)
	return nil
}

var errPrepareAlreadyClaimed = errors.New("prepare already claimed")

// streamBulkSourceEmailsFiltered streams the source file line-by-line, applying
// syntax validation in the same pass. This avoids holding two full copies of the
// email list in memory simultaneously (old: load-all → filter-copy = 2× RAM).
// For very large jobs (500k–1M emails) this cuts peak RSS by ~40–60 MB.
func (s *jobService) streamBulkSourceEmailsFiltered(jobID string) ([]string, error) {
	sourcePath := os.Getenv("BULK_SOURCE_PATH")
	if sourcePath == "" {
		sourcePath = "./storage/jobs/bulk"
	}
	sourceFilePath := filepath.Join(sourcePath, jobID+"_source.txt")
	file, err := os.Open(sourceFilePath)
	if err == nil {
		defer file.Close()
		result, scanErr := scanSyntaxFiltered(file)
		if scanErr != nil {
			return nil, scanErr
		}
		if len(result) > 0 {
			return result, nil
		}
	}

	// Multi-replica fallback: Redis copy written at accept time.
	if emails, ok := loadBulkSourceFromRedis(jobID); ok {
		logger.Info("Loaded bulk source from Redis fallback", "job_id", jobID, "count", len(emails))
		// Best-effort rewrite local file for retry/download paths.
		_ = s.writeBulkSourceFile(jobID, emails)
		// Filter the Redis copy in memory (already small enough — Redis cap is lower).
		filtered := make([]string, 0, len(emails))
		for _, e := range emails {
			if helper.IsValidMailboxSyntax(e) {
				filtered = append(filtered, e)
			}
		}
		if len(filtered) > 0 {
			return filtered, nil
		}
	}

	if err != nil {
		return nil, err
	}
	return nil, errors.New("source empty")
}

// scanSyntaxFiltered reads an io.Reader line-by-line and returns only
// syntax-valid emails. A single 64 KB scanner buffer is reused throughout
// so no extra per-line allocation happens.
func scanSyntaxFiltered(r io.Reader) ([]string, error) {
	scanner := bufio.NewScanner(r)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1*1024*1024)
	var result []string
	for scanner.Scan() {
		email := strings.TrimSpace(scanner.Text())
		if email != "" && helper.IsValidMailboxSyntax(email) {
			result = append(result, email)
		}
	}
	return result, scanner.Err()
}

// loadBulkSourceEmails provides backward compatibility, returning syntax-filtered emails.
func (s *jobService) loadBulkSourceEmails(jobID string) ([]string, error) {
	return s.streamBulkSourceEmailsFiltered(jobID)
}

// FailPreparingJob marks a stuck preparing job failed and refunds remaining credits.
func (s *jobService) FailPreparingJob(jobID, reason string) error {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return err
	}
	if job.Status != "preparing" {
		return nil
	}
	queued := job.TotalEmails - job.InvalidSyntax
	if queued < 0 {
		queued = 0
	}
	return s.RefundJob(job.UserID, job.JobID, queued, reason)
}

func (s *jobService) enqueueBulkChunks(job *model.Job, user *model.User, queueEmails []string, savedTasks []model.JobTask, refundOnFailure bool) (bool, error) {
	type chunkPlan struct {
		task   model.JobTask
		hits   []model.EmailCache
		misses []string
	}

	_, chunkTimeout := s.getChunkStrategyForList(len(queueEmails))
	queueName := pipeline.AsynqQueueForRole(user.Role)
	b2bRet, freeValidRet, freeInvalidRet := s.getCacheRetentionPolicies()
	domainPolicies := s.loadDomainPolicyMap(pipeline.UniqueDomains(queueEmails))

	failEnqueue := func(reason string) (bool, error) {
		if refundOnFailure {
			_ = s.RefundJob(job.UserID, job.JobID, len(queueEmails), reason)
			return false, nil
		}
		// Resume path: keep credits, restore paused so user can try again.
		_ = jobcontrol.SetPaused(job.JobID)
		_ = s.jobRepo.DB().Model(&model.Job{}).Where("job_id = ?", job.JobID).Update("status", "paused").Error
		logger.Error("Resume enqueue failed; job restored to paused", "job_id", job.JobID, "reason", reason)
		return false, nil
	}

	// Phase 1: classify only (no DB writes / no enqueue) so a later failure cannot orphan hits.
	plans := make([]chunkPlan, 0, len(savedTasks))
	var plannedHits, plannedMisses int
	for i := range savedTasks {
		currentTask := savedTasks[i]
		if currentTask.StartIndex >= len(queueEmails) {
			continue
		}
		endIndex := currentTask.EndIndex
		if endIndex >= len(queueEmails) {
			endIndex = len(queueEmails) - 1
		}
		chunkEmails := queueEmails[currentTask.StartIndex : endIndex+1]

		cachedResults, err := s.cacheRepo.GetCachedEmailsInBatches(chunkEmails, b2bRet, freeValidRet, freeInvalidRet)
		if err != nil {
			logger.Error("Cache check error", "error", err)
			cachedResults = make(map[string]model.EmailCache)
		}
		hits, misses := classifyChunkEmails(chunkEmails, cachedResults, domainPolicies)
		plans = append(plans, chunkPlan{task: currentTask, hits: hits, misses: misses})
		plannedHits += len(hits)
		plannedMisses += len(misses)
	}

	if plannedHits+plannedMisses == 0 {
		return failEnqueue("prepare: nothing to queue")
	}

	// Phase 2: enqueue all misses first. On any failure, cancel and refund — no hits written yet.
	var enqueuedAsynqIDs []string
	for _, plan := range plans {
		if len(plan.misses) == 0 {
			continue
		}
		task, err := tasks.NewEmailChunkTask(job.JobID, plan.task.ID, plan.misses, chunkTimeout)
		if err != nil {
			logger.Error("Failed to build chunk task", "job_id", job.JobID, "task_id", plan.task.ID, "error", err)
			s.cancelAsynqTasks(enqueuedAsynqIDs)
			return failEnqueue(fmt.Sprintf("failed to build chunk task %d", plan.task.ID))
		}
		// Asynq Timeout is hang-safety only (includes concurrency-gate wait).
		// The real Job Control budget starts after the worker acquires its slot.
		asynqHang := chunkTimeout + 4*time.Hour
		info, err := config.AsynqClient.Enqueue(task, asynq.MaxRetry(3), asynq.Timeout(asynqHang), asynq.Queue(queueName))
		if err != nil {
			logger.Error("Failed to enqueue chunk task", "job_id", job.JobID, "task_id", plan.task.ID, "error", err)
			s.cancelAsynqTasks(enqueuedAsynqIDs)
			return failEnqueue(fmt.Sprintf("failed to enqueue chunk task %d", plan.task.ID))
		}
		if info != nil && info.ID != "" {
			enqueuedAsynqIDs = append(enqueuedAsynqIDs, info.ID)
		}
	}

	// Phase 3: persist cache/domain hits only after all misses are safely queued.
	var writtenHitEmails []string
	for _, plan := range plans {
		if len(plan.hits) == 0 {
			continue
		}
		if err := s.processCacheHits(job.JobID, job.ID, plan.task.ID, plan.hits); err != nil {
			logger.Error("Failed to persist cache hits after enqueue", "job_id", job.JobID, "task_id", plan.task.ID, "error", err)
			s.cancelAsynqTasks(enqueuedAsynqIDs)
			if refundOnFailure {
				_ = s.rollbackPrepareHitEmails(job, writtenHitEmails, len(queueEmails), fmt.Sprintf("failed to persist cache hits for task %d", plan.task.ID))
			} else {
				if len(writtenHitEmails) > 0 {
					const batch = 500
					for i := 0; i < len(writtenHitEmails); i += batch {
						end := i + batch
						if end > len(writtenHitEmails) {
							end = len(writtenHitEmails)
						}
						_ = s.jobRepo.DB().Where("job_internal_id = ? AND email IN ?", job.ID, writtenHitEmails[i:end]).
							Delete(&model.JobResult{}).Error
					}
				}
				_ = jobcontrol.SetPaused(job.JobID)
				_ = s.jobRepo.DB().Model(&model.Job{}).Where("job_id = ?", job.JobID).Update("status", "paused").Error
			}
			return false, nil
		}
		for _, h := range plan.hits {
			writtenHitEmails = append(writtenHitEmails, h.Email)
		}
	}

	return true, nil
}

// rollbackPrepareHitEmails removes only hits written in this prepare/retry attempt (preserves prior verified rows on retry).
func (s *jobService) rollbackPrepareHitEmails(job *model.Job, hitEmails []string, refundCredits int, reason string) error {
	if len(hitEmails) > 0 {
		const batch = 500
		for i := 0; i < len(hitEmails); i += batch {
			end := i + batch
			if end > len(hitEmails) {
				end = len(hitEmails)
			}
			_ = s.jobRepo.DB().Where("job_internal_id = ? AND email IN ?", job.ID, hitEmails[i:end]).
				Delete(&model.JobResult{}).Error
		}
	}

	var agg struct {
		Total         int64
		Deliverable   int64
		Undeliverable int64
		Risky         int64
		CatchAll      int64
		Disposable    int64
		RoleAccounts  int64
	}
	_ = s.jobRepo.DB().Model(&model.JobResult{}).
		Select(`COUNT(*) AS total,
			COALESCE(SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END), 0) AS deliverable,
			COALESCE(SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END), 0) AS undeliverable,
			COALESCE(SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END), 0) AS risky,
			COALESCE(SUM(CASE WHEN status = 'catch_all' OR is_catch_all = TRUE THEN 1 ELSE 0 END), 0) AS catch_all,
			COALESCE(SUM(CASE WHEN status = 'disposable' OR is_disposable = TRUE THEN 1 ELSE 0 END), 0) AS disposable,
			COALESCE(SUM(CASE WHEN is_role = TRUE THEN 1 ELSE 0 END), 0) AS role_accounts`).
		Where("job_internal_id = ?", job.ID).
		Scan(&agg).Error

	processed := int(agg.Total) + job.InvalidSyntax
	_ = s.jobRepo.DB().Model(&model.Job{}).Where("id = ?", job.ID).Updates(map[string]interface{}{
		"processed_count": processed,
		"deliverable":     int(agg.Deliverable),
		"undeliverable":   int(agg.Undeliverable) + job.InvalidSyntax,
		"risky":           int(agg.Risky),
		"catch_all":       int(agg.CatchAll),
		"disposable":      int(agg.Disposable),
		"role_accounts":   int(agg.RoleAccounts),
		"status":          "failed",
	}).Error
	_ = s.jobRepo.DB().Model(&model.JobTask{}).Where("job_id = ?", job.JobID).Update("status", "failed").Error
	return s.RefundJob(job.UserID, job.JobID, refundCredits, reason)
}

func (s *jobService) cancelAsynqTasks(taskIDs []string) {
	if len(taskIDs) == 0 || config.Redis == nil {
		return
	}
	opt := config.Redis.Options()
	inspector := asynq.NewInspector(asynq.RedisClientOpt{
		Addr:     opt.Addr,
		Password: opt.Password,
		DB:       opt.DB,
	})
	defer inspector.Close()

	queues := []string{"default", "critical", "low", "prepare"}
	for _, id := range taskIDs {
		deleted := false
		for _, q := range queues {
			if err := inspector.DeleteTask(q, id); err == nil {
				deleted = true
				break
			}
		}
		if !deleted {
			logger.Warn("Failed to delete orphaned asynq task after enqueue failure", "task_id", id)
		}
	}
}

// purgeJobAsynqTasks scans every Asynq queue state (pending, active, retry,
// scheduled, archived) and hard-deletes any task whose payload contains this
// job_id. This is called during Resume/Retry BEFORE new chunks are enqueued so
// orphaned tasks left behind by disabled/restarted workers cannot race the fresh
// resume chunks and report stale results against new task IDs.
//
// Deletion errors are logged but never fatal — the subsequent DB transaction
// controls correctness. Any tasks that survive purge will either:
//   (a) be dropped by the IsPaused check (pause flag was cleared after purge), or
//   (b) report against a task_id that no longer exists (backend idempotency handles this).
func (s *jobService) purgeJobAsynqTasks(jobID string) {
	if config.Redis == nil {
		return
	}
	opt := config.Redis.Options()
	inspector := asynq.NewInspector(asynq.RedisClientOpt{
		Addr:     opt.Addr,
		Password: opt.Password,
		DB:       opt.DB,
	})
	defer inspector.Close()

	queues := []string{"default", "critical", "low", "prepare"}
	purged := 0

	for _, q := range queues {
		// Check each possible task state. Active tasks (currently running) cannot
		// be forcibly deleted via Inspector — they will finish and report against
		// the now-deleted task_id, which the backend handles gracefully.
		for _, listFn := range []func(string, ...asynq.ListOption) ([]*asynq.TaskInfo, error){
			func(q string, opts ...asynq.ListOption) ([]*asynq.TaskInfo, error) {
				return inspector.ListPendingTasks(q, opts...)
			},
			func(q string, opts ...asynq.ListOption) ([]*asynq.TaskInfo, error) {
				return inspector.ListRetryTasks(q, opts...)
			},
			func(q string, opts ...asynq.ListOption) ([]*asynq.TaskInfo, error) {
				return inspector.ListScheduledTasks(q, opts...)
			},
			func(q string, opts ...asynq.ListOption) ([]*asynq.TaskInfo, error) {
				return inspector.ListArchivedTasks(q, opts...)
			},
		} {
			tasks, err := listFn(q, asynq.PageSize(1000))
			if err != nil {
				continue
			}
			for _, task := range tasks {
				// Quick check: does the raw payload contain this job_id?
				if !containsJobID(task.Payload, jobID) {
					continue
				}
				if err := inspector.DeleteTask(q, task.ID); err == nil {
					purged++
				}
			}
		}
	}

	if purged > 0 {
		logger.Info("purgeJobAsynqTasks: removed orphaned tasks before resume",
			"job_id", jobID,
			"purged", purged,
		)
	}
}

// containsJobID is a fast byte-search that avoids a full JSON unmarshal when
// scanning potentially thousands of Asynq task payloads during purge.
func containsJobID(payload []byte, jobID string) bool {
	return strings.Contains(string(payload), jobID)
}

// getChunkStrategyForList returns dynamic (chunkSize, timeoutDuration) based on list size and 3-Tier Job Control settings.
func (s *jobService) getChunkStrategyForList(totalEmails int) (int, time.Duration) {
	t1Max, t1Size, t1Timeout := 50000, 100, 15
	t2Max, t2Size, t2Timeout := 100000, 500, 60
	t3Max, t3Size, t3Timeout := 500000, 1000, 120

	if set, err := s.settingsRepo.GetByKey("chunk_tier1_max_list"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t1Max = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier1_size"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t1Size = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier1_timeout"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t1Timeout = v
		}
	}

	if set, err := s.settingsRepo.GetByKey("chunk_tier2_max_list"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t2Max = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier2_size"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t2Size = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier2_timeout"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t2Timeout = v
		}
	}

	if set, err := s.settingsRepo.GetByKey("chunk_tier3_max_list"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t3Max = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier3_size"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t3Size = v
		}
	}
	if set, err := s.settingsRepo.GetByKey("chunk_tier3_timeout"); err == nil {
		if v, convErr := strconv.Atoi(set.SettingValue); convErr == nil && v > 0 {
			t3Timeout = v
		}
	}

	_ = t3Max
	selectedSize := t3Size
	selectedTimeout := t3Timeout

	switch {
	case totalEmails <= t1Max:
		selectedSize = t1Size
		selectedTimeout = t1Timeout
	case totalEmails <= t2Max:
		selectedSize = t2Size
		selectedTimeout = t2Timeout
	default:
		selectedSize = t3Size
		selectedTimeout = t3Timeout
	}

	// Warmup: only throttle prepare chunks when EVERY enabled worker is warming up.
	// If any full-capacity server exists, use the tier size unchanged.
	// When the whole fleet is warming, use the MAX cap (least restrictive) — never the global min.
	var enabledServers []model.WorkerServer
	if err := config.DB.Where("enabled = ?", true).Find(&enabledServers).Error; err == nil && len(enabledServers) > 0 {
		allWarming := true
		bestWarmupCap := 0
		for _, srv := range enabledServers {
			if !srv.WarmupEnabled {
				allWarming = false
				break
			}
			cap := warmupChunkCap(srv, t1Size, t2Size, t3Size)
			if cap > bestWarmupCap {
				bestWarmupCap = cap
			}
		}
		if allWarming && bestWarmupCap > 0 && selectedSize > bestWarmupCap {
			selectedSize = bestWarmupCap
		}
	}

	if selectedSize < 10 {
		selectedSize = 10
	}
	if selectedTimeout < 1 {
		selectedTimeout = 1
	}
	return selectedSize, time.Duration(selectedTimeout) * time.Minute
}

func warmupChunkCap(srv model.WorkerServer, t1Size, t2Size, t3Size int) int {
	ageHours := time.Since(srv.CreatedAt.UTC()).Hours()
	ageDays := int(ageHours/24) + 1
	mode := strings.ToLower(strings.TrimSpace(srv.WarmupMode))
	if mode == "" {
		mode = "medium"
	}
	switch mode {
	case "low", "medium":
		switch {
		case ageDays <= 2:
			return t1Size
		case ageDays <= 5:
			return t2Size
		default:
			return t3Size
		}
	case "fast":
		if ageDays <= 2 {
			return t2Size
		}
		return t3Size
	default:
		return t3Size
	}
}

// loadDomainPolicyMap loads domain intelligence rows for a bulk job (one query).
func (s *jobService) loadDomainPolicyMap(domains []string) map[string]string {
	out := make(map[string]string)
	if len(domains) == 0 {
		return out
	}
	const batch = 500
	for i := 0; i < len(domains); i += batch {
		end := i + batch
		if end > len(domains) {
			end = len(domains)
		}
		var rows []struct {
			Domain string
			Type   string
		}
		if err := s.jobRepo.DB().Table("domains").
			Select("domain, type").
			Where("excluded = ? AND domain IN ?", false, domains[i:end]).
			Find(&rows).Error; err != nil {
			logger.Warn("domain intelligence load failed", "error", err)
			continue
		}
		for _, row := range rows {
			out[strings.ToLower(row.Domain)] = row.Type
		}
	}
	return out
}

// classifyChunkEmails applies EmailCache then Domain Intelligence before SMTP queue.
func classifyChunkEmails(chunkEmails []string, cached map[string]model.EmailCache, policies map[string]string) (hits []model.EmailCache, misses []string) {
	for _, email := range chunkEmails {
		if hit, ok := cached[email]; ok {
			hits = append(hits, hit)
			continue
		}
		if intel, ok := pipeline.ResolveDomainIntel(email, policies); ok {
			hits = append(hits, model.EmailCache{
				Email:         email,
				Status:        intel.Status,
				Score:         intel.Score,
				Reason:        intel.Reason,
				IsDisposable:  intel.IsDisposable,
				IsSpamTrap:    intel.IsSpamTrap,
				IsBlacklisted: intel.IsBlacklisted,
				IsFree:        intel.IsFree,
				IsSyntaxValid: true,
			})
			continue
		}
		misses = append(misses, email)
	}
	return hits, misses
}

func (s *jobService) RefundJob(userID uint, jobID string, credits int, reason string) error {
	description := fmt.Sprintf("Full refund: job %s queue failure. Reason: %s", jobID, reason)
	if err := s.jobRepo.RefundBulkJob(userID, jobID, credits, description); err != nil {
		return err
	}

	jobcontrol.ClearPaused(jobID)
	if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
		ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
			"credits": updatedUser.Credits,
		})
	}
	InvalidateAndRefreshDashboardStats(userID)
	return nil
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

func (s *jobService) processCacheHits(jobID string, jobInternalID uint, taskID uint, hits []model.EmailCache) error {
	if len(hits) == 0 {
		return nil
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
				jobcontrol.JobStatusAfterProgressSQL,
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
		return err
	}

	// Async NDJSON append
	jobIDCopyForNDJSON := jobID
	newRowsCopy := newRows
	safe.Go(func() {
		jobID := jobIDCopyForNDJSON
		newRows := newRowsCopy
		basePath := os.Getenv("BULK_RESULTS_PATH")
		if basePath == "" {
			basePath = "./storage/results/bulk"
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
				"type":            updatedJob.JobType,
				"filename":        updatedJob.Filename,
				"total_emails":    updatedJob.TotalEmails,
				"processed_count": updatedJob.ProcessedCount,
				"created_at":      updatedJob.CreatedAt,
				"deliverable":     updatedJob.Deliverable,
				"undeliverable":   updatedJob.Undeliverable,
				"risky":           updatedJob.Risky,
				"catch_all":       updatedJob.CatchAll,
				"disposable":      updatedJob.Disposable,
				"role_accounts":   updatedJob.RoleAccounts,
			},
		}
	}
	return nil
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

func (s *jobService) PauseJob(userID uint, jobID string) (*model.Job, error) {
	job, err := s.jobRepo.GetJobForUser(userID, jobID)
	if err != nil {
		return nil, errors.New("job not found")
	}
	switch job.Status {
	case "pending", "processing":
		// ok
	default:
		return nil, errors.New("only pending or processing jobs can be paused")
	}

	// Redis first — workers soft-stop via this flag. Fail closed if Redis is down.
	if err := jobcontrol.SetPaused(job.JobID); err != nil {
		logger.Error("Pause refused: redis flag not set", "job_id", job.JobID, "error", err)
		return nil, errors.New("pause unavailable: redis error")
	}

	res := s.jobRepo.DB().Model(job).
		Where("job_id = ? AND status IN ?", job.JobID, []string{"pending", "processing"}).
		Update("status", "paused")
	if res.Error != nil {
		jobcontrol.ClearPaused(job.JobID)
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		jobcontrol.ClearPaused(job.JobID)
		return nil, errors.New("only pending or processing jobs can be paused")
	}
	job.Status = "paused"

	ws.GlobalHub.BroadcastToUser(userID, "job_update", gin.H{
		"job": gin.H{
			"job_id":          job.JobID,
			"status":          "paused",
			"filename":        job.Filename,
			"total_emails":    job.TotalEmails,
			"processed_count": job.ProcessedCount,
			"created_at":      job.CreatedAt,
			"deliverable":     job.Deliverable,
			"undeliverable":   job.Undeliverable,
			"risky":           job.Risky,
			"catch_all":       job.CatchAll,
			"disposable":      job.Disposable,
		},
	})
	InvalidateAndRefreshDashboardStats(userID)
	return job, nil
}

func (s *jobService) ResumeJob(userID uint, jobID string) (*model.Job, error) {
	job, err := s.jobRepo.GetJobForUser(userID, jobID)
	if err != nil {
		return nil, errors.New("job not found")
	}
	if job.Status != "paused" {
		return nil, errors.New("only paused jobs can be resumed")
	}
	// Credits already charged at upload — only re-enqueue unverified emails.
	return s.requeueRemainingWork(userID, job, false)
}

func (s *jobService) RetryJob(userID uint, jobID string) (*model.Job, error) {
	job, err := s.jobRepo.GetJobForUser(userID, jobID)
	if err != nil {
		return nil, errors.New("job not found")
	}
	if job.Status != "failed" {
		return nil, errors.New("only failed jobs can be retried")
	}
	return s.requeueRemainingWork(userID, job, true)
}

// requeueRemainingWork rebuilds chunks for emails not yet in job_results.
// chargeCredits is true for failed-job retry; false for pause→resume (already paid).
func (s *jobService) requeueRemainingWork(userID uint, job *model.Job, chargeCredits bool) (*model.Job, error) {
	sourceEmails, srcErr := s.loadBulkSourceEmails(job.JobID)
	if srcErr != nil {
		return nil, errors.New("original source file not found, cannot retry job. Please re-upload your list.")
	}

	// Purge orphaned Asynq tasks BEFORE clearing the pause flag or touching the DB.
	// This prevents tasks abandoned by disabled/restarted workers from racing the
	// new resume chunks and reporting stale results against new task IDs.
	s.purgeJobAsynqTasks(job.JobID)

	expectedStatus := "paused"
	if chargeCredits {
		expectedStatus = "failed"
	}

	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, errors.New("user not found")
	}

	var queueEmails []string
	var savedTasks []model.JobTask
	var processedCount int

	err = s.jobRepo.DB().Transaction(func(tx *gorm.DB) error {
		var locked model.Job
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("job_id = ? AND user_id = ? AND status = ?", job.JobID, userID, expectedStatus).
			First(&locked).Error; err != nil {
			return errors.New("job state changed; refresh and try again")
		}
		*job = locked

		var verifiedEmails []string
		if err := tx.Model(&model.JobResult{}).Where("job_internal_id = ?", job.ID).Pluck("email", &verifiedEmails).Error; err != nil {
			return fmt.Errorf("failed to fetch existing results: %v", err)
		}
		verifiedMap := make(map[string]bool, len(verifiedEmails))
		for _, e := range verifiedEmails {
			verifiedMap[strings.ToLower(strings.TrimSpace(e))] = true
		}

		remaining := make([]string, 0)
		for _, raw := range sourceEmails {
			email := strings.ToLower(strings.TrimSpace(raw))
			if email == "" || verifiedMap[email] {
				continue
			}
			if !helper.IsValidMailboxSyntax(email) {
				continue
			}
			remaining = append(remaining, email)
		}

		processedCount = len(verifiedEmails) + job.InvalidSyntax
		if processedCount > job.TotalEmails {
			processedCount = job.TotalEmails
		}

		if len(remaining) == 0 {
			jobcontrol.ClearPaused(job.JobID)
			return tx.Model(job).Updates(map[string]interface{}{
				"status":          "completed",
				"processed_count": processedCount,
			}).Error
		}

		creditsToDeduct := 0
		if chargeCredits {
			creditsToDeduct = len(remaining)
			res := tx.Model(&model.User{}).
				Where("id = ? AND credits >= ?", userID, creditsToDeduct).
				Update("credits", gorm.Expr("credits - ?", creditsToDeduct))
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return fmt.Errorf("insufficient credits")
			}

			txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(6))
			transaction := model.Transaction{
				UserID:        userID,
				TransactionID: txnID,
				Amount:        0,
				CreditsAdded:  -creditsToDeduct,
				Type:          "bulk_verify_retry",
				Status:        "completed",
				Description:   fmt.Sprintf("Retry Job: %s (%d emails resumed)", job.Filename, creditsToDeduct),
			}
			if err := tx.Create(&transaction).Error; err != nil {
				return err
			}
		}

		baseChunkSize, _ := s.getChunkStrategyForList(len(remaining))
		remaining, prepChunks := pipeline.PrepareQueue(remaining, baseChunkSize)
		queueEmails = remaining

		if err := tx.Unscoped().Where("job_id = ?", job.JobID).Delete(&model.JobTask{}).Error; err != nil {
			return err
		}
		savedTasks = savedTasks[:0]
		for _, ch := range prepChunks {
			task := model.JobTask{
				JobID:      job.JobID,
				StartIndex: ch.StartIndex,
				EndIndex:   ch.EndIndex,
				Status:     "queued",
			}
			if err := tx.Create(&task).Error; err != nil {
				return err
			}
			savedTasks = append(savedTasks, task)
		}

		return tx.Model(job).Updates(map[string]interface{}{
			"status":          "pending",
			"processed_count": processedCount,
		}).Error
	})
	if err != nil {
		return nil, err
	}

	if len(queueEmails) == 0 {
		job.Status = "completed"
		job.ProcessedCount = processedCount
		InvalidateAndRefreshDashboardStats(userID)
		return job, nil
	}

	// Clear soft-stop BEFORE enqueue so newly queued chunks are not ACK'd as paused.
	// (Leaving the flag set until after enqueue caused workers to drop fresh chunks.)
	jobcontrol.ClearPaused(job.JobID)

	enqueuedOK, err := s.enqueueBulkChunks(job, user, queueEmails, savedTasks, chargeCredits)
	if err != nil {
		return nil, err
	}
	if !enqueuedOK {
		if chargeCredits {
			return nil, errors.New("failed to queue some emails for processing. The entire job has been cancelled and credits refunded.")
		}
		return nil, errors.New("failed to queue remaining emails; job left paused — try resume again")
	}

	job.Status = "pending"
	job.ProcessedCount = processedCount
	if chargeCredits {
		if updatedUser, err := s.userRepo.GetByID(userID); err == nil {
			ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", gin.H{
				"credits": updatedUser.Credits,
			})
		}
	}
	ws.GlobalHub.BroadcastToUser(userID, "job_update", gin.H{
		"job": gin.H{
			"job_id":          job.JobID,
			"status":          "pending",
			"filename":        job.Filename,
			"total_emails":    job.TotalEmails,
			"processed_count": processedCount,
			"created_at":      job.CreatedAt,
		},
	})
	InvalidateAndRefreshDashboardStats(userID)
	return job, nil
}


