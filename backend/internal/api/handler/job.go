package handler

import (
	"net/http"
	"os"
	"strconv"

	"ejp-backend/internal/api/request"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/internal/storage"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
)

type JobHandler struct {
	jobService service.JobService
}

func NewJobHandler(jobService service.JobService) *JobHandler {
	return &JobHandler{jobService: jobService}
}

func (h *JobHandler) GetJobs(c *gin.Context) {
	userID, _ := c.Get("userID")
	jobType := c.Query("type")

	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			if parsedLimit > 100 {
				limit = 100 // Hard cap to prevent DoS via massive payload request
			} else {
				limit = parsedLimit
			}
		}
	}

	offset := 0
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	jobs, total, err := h.jobService.GetJobs(userID.(uint), jobType, limit, offset)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch jobs", "ERR_FETCH_JOBS")
		return
	}
	if jobs == nil {
		helper.SendSuccess(c, "Jobs retrieved successfully", gin.H{"jobs": []interface{}{}, "total": 0})
		return
	}
	helper.SendSuccess(c, "Jobs retrieved successfully", gin.H{"jobs": jobs, "total": total})
}

func (h *JobHandler) GetJobStatus(c *gin.Context) {
	userID, _ := c.Get("userID")
	jobID := c.Query("jobId")
	if jobID == "" {
		helper.SendError(c, http.StatusBadRequest, "Job ID is required", "")
		return
	}

	job, result, err := h.jobService.GetJobStatus(userID.(uint), jobID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "Job not found", err.Error())
		return
	}
	helper.SendSuccess(c, "Job status retrieved", gin.H{"job": job, "result": result})
}

func (h *JobHandler) SubmitSingleVerify(c *gin.Context) {
	userID, _ := c.Get("userID")
	var req request.SingleVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", "ERR_INVALID_REQUEST")
		return
	}

	var apiKeyID *uint
	if kID, exists := c.Get("apiKeyID"); exists {
		if id, ok := kID.(uint); ok {
			apiKeyID = &id
		}
	}

	job, result, err := h.jobService.VerifySingle(userID.(uint), req.Email, apiKeyID, req.IdempotencyKey)
	if err != nil {
		switch err.Error() {
		case "insufficient credits":
			helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits for verification.", "ERR_INSUFFICIENT_CREDITS")
		case "verification timed out":
			helper.SendError(c, http.StatusGatewayTimeout, "Verification timed out. Credits have been refunded.", "ERR_VERIFY_TIMEOUT")
		case "verification busy":
			helper.SendError(c, http.StatusServiceUnavailable, "Verification is temporarily busy. Credits have been refunded. Please retry.", "ERR_VERIFY_BUSY")
		case "a request with this idempotency key is already in progress":
			helper.SendError(c, http.StatusConflict, "A verification with this idempotency key is already in progress.", "ERR_IDEMPOTENCY_IN_PROGRESS")
		case "duplicate request detected":
			helper.SendError(c, http.StatusConflict, "Duplicate verification request.", "ERR_DUPLICATE_REQUEST")
		case "failed to save verification results, credits have been refunded":
			helper.SendError(c, http.StatusInternalServerError, "Verification failed. Credits have been refunded.", "ERR_VERIFY_SAVE_FAILED")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Verification failed", "ERR_VERIFY_FAILED")
		}
		return
	}

	if result == nil {
		helper.SendError(c, http.StatusInternalServerError, "Verification failed", "ERR_VERIFY_FAILED")
		return
	}

	// Map to structure expected by frontend (form.tsx / VerificationResult)
	response := gin.H{
		"job_id":         job.JobID,
		"email":          result.Email,
		"status":         result.Status,
		"score":          result.Score,
		"processingTime": result.ProcessingTime,
		"detailedChecks": gin.H{
			"safeToSend":      result.IsDeliverable,
			"deliverable":     result.IsDeliverable,
			"invalidSyntax":   !result.IsSyntaxValid,
			"disposableEmail": result.IsDisposable,
			"mxRecords":       result.HasMx,
			"smtpConnect":     result.SmtpConnect,
			"userExist":       result.IsDeliverable,
			"unknown":         result.Status == "unknown",
			"mailboxFull":     result.MailboxFull,
			"catchAll":        result.IsCatchAll,
			"roleAccount":     result.IsRole,
			"freeAccount":     result.IsFree,
			"spamTrap":        result.IsSpamTrap,
			"blacklist":       result.IsBlacklisted,
		},
		"rawJson": result,
	}

	helper.SendSuccess(c, "Email verified", response)
}

func (h *JobHandler) DeleteJob(c *gin.Context) {
	userID, _ := c.Get("userID")
	var req struct {
		JobID string `json:"job_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", err.Error())
		return
	}

	if err := h.jobService.DeleteJob(userID.(uint), req.JobID); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete job", err.Error())
		return
	}

	// Cleanup ndjson file from filesystem after successful DB deletion
	jobIDCopy := req.JobID
	safe.Go(func() {
		jobID := jobIDCopy
		basePath := os.Getenv("BULK_RESULTS_PATH")
		if basePath == "" {
			basePath = "./storage/results/bulk"
		}
		_ = storage.DeleteJobFile(basePath, jobID)
	})

	helper.SendSuccess(c, "Job deleted successfully", nil)
}

func (h *JobHandler) RetryJob(c *gin.Context) {
	userID, _ := c.Get("userID")
	var req struct {
		JobID string `json:"job_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request", err.Error())
		return
	}

	job, err := h.jobService.RetryJob(userID.(uint), req.JobID)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "Job retried and queued successfully", gin.H{
		"jobId":  job.JobID,
		"status": job.Status,
	})
}
