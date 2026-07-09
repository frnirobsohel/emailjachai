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
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch jobs", err.Error())
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
		helper.SendError(c, http.StatusBadRequest, "Invalid request", err.Error())
		return
	}

	var apiKeyID *uint
	if kID, exists := c.Get("apiKeyID"); exists {
		if id, ok := kID.(uint); ok {
			apiKeyID = &id
		}
	}

	job, result, err := h.jobService.VerifySingle(userID.(uint), req.Email, apiKeyID)
	if err != nil {
		// Return 402 for insufficient credits (matches legacy PHP parity)
		if err.Error() == "insufficient credits" {
			helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits for verification.", "ERR_INSUFFICIENT_CREDITS")
			return
		}
		helper.SendError(c, http.StatusInternalServerError, "Verification failed", err.Error())
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

