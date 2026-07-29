package handler

import (
	"bufio"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

func (h *JobHandler) SubmitBulkJob(c *gin.Context) {
	// Limit request body size to 200MB to prevent memory exhaustion / denial of service
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 200*1024*1024)

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

		// Perform Extension checks (.csv, .txt)
		filename = fileHeader.Filename
		dotIndex := strings.LastIndex(filename, ".")
		if dotIndex == -1 {
			helper.SendError(c, http.StatusBadRequest, "Invalid file name. Missing extension.", "ERR_INVALID_FILE")
			return
		}
		ext := strings.ToLower(filename[dotIndex+1:])
		if ext != "csv" && ext != "txt" {
			helper.SendError(c, http.StatusBadRequest, "Invalid file extension. Only .csv and .txt files are allowed.", "ERR_INVALID_FILE_EXTENSION")
			return
		}

		// Perform MIME checks (octet-stream rejected — extension alone is not enough)
		fileMime := strings.ToLower(fileHeader.Header.Get("Content-Type"))
		if fileMime != "" &&
			!strings.Contains(fileMime, "text/csv") &&
			!strings.Contains(fileMime, "text/plain") &&
			!strings.Contains(fileMime, "application/csv") &&
			!strings.Contains(fileMime, "application/vnd.ms-excel") {
			helper.SendError(c, http.StatusBadRequest, "Invalid file MIME type.", "ERR_INVALID_MIME")
			return
		}

		file, err := fileHeader.Open()
		if err != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to open uploaded file.", "")
			return
		}
		defer file.Close()

		// Fetch limit via jobService instead of DB
		maxLimit := h.jobService.GetMaxEmailsPerJobLimit()

		sourceEmails, sourceCount = extractEmailsWithSourceCount(file, maxLimit)
		idempotencyKey = c.Request.Header.Get("X-Idempotency-Key")
		if idempotencyKey == "" {
			idempotencyKey = c.PostForm("idempotencyKey")
		}
	}

	var apiKeyID *uint
	if kID, exists := c.Get("apiKeyID"); exists {
		if id, ok := kID.(uint); ok {
			apiKeyID = &id
		}
	}

	job, _, err := h.jobService.SubmitBulkJob(userID.(uint), filename, sourceEmails, idempotencyKey, apiKeyID)
	if err != nil {
		var idempErr *service.IdempotencyError
		if errors.As(err, &idempErr) {
			helper.SendSuccess(c, "Job already submitted (idempotent)", gin.H{
				"jobId":        idempErr.JobID,
				"total":        idempErr.Total,
				"queued":       idempErr.Queued,
				"status":       idempErr.Status,
				"is_duplicate": true,
			})
			return
		}

		errStr := err.Error()
		switch {
		case strings.Contains(errStr, "insufficient credits"):
			helper.SendError(c, http.StatusPaymentRequired, "Insufficient credits for this job.", "ERR_INSUFFICIENT_CREDITS")
		case strings.Contains(errStr, "active jobs"):
			helper.SendError(c, http.StatusTooManyRequests, "Too many active jobs. Please wait for existing jobs to finish.", "ERR_ACTIVE_JOBS_LIMIT")
		case strings.Contains(errStr, "limited to"):
			helper.SendError(c, http.StatusBadRequest, "Email count exceeds the maximum allowed per job.", "ERR_LIMIT_EXCEEDED")
		case strings.Contains(errStr, "job queue is temporarily unavailable"):
			helper.SendError(c, http.StatusServiceUnavailable, "Job queue is temporarily unavailable. Please try again.", "ERR_QUEUE_DOWN")
		case strings.Contains(errStr, "no valid emails"):
			helper.SendError(c, http.StatusBadRequest, "No valid emails found in the upload.", "ERR_NO_VALID_EMAILS")
		case strings.Contains(errStr, "idempotency key is already in progress"):
			helper.SendError(c, http.StatusConflict, "A job with this idempotency key is already in progress.", "ERR_IDEMPOTENCY_IN_PROGRESS")
		case strings.Contains(errStr, "duplicate request"):
			helper.SendError(c, http.StatusConflict, "Duplicate job request.", "ERR_DUPLICATE_REQUEST")
		case strings.Contains(errStr, "failed to queue") || strings.Contains(errStr, "credits refunded"):
			helper.SendError(c, http.StatusInternalServerError, "Failed to queue job. Credits have been refunded.", "ERR_QUEUE_FAILED")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Failed to submit job.", "ERR_SUBMIT_JOB")
		}
		return
	}

	queuedCount := job.TotalEmails - job.InvalidSyntax
	duplicatesRemoved := sourceCount - job.TotalEmails

	helper.SendSuccess(c, "Job created and queued successfully", gin.H{
		"jobId":              job.JobID,
		"total":              job.TotalEmails,
		"queued":             queuedCount,
		"pre_filtered":       job.InvalidSyntax,
		"duplicates_removed": duplicatesRemoved,
	})
}

func extractEmailsWithSourceCount(file multipart.File, maxLimit int) ([]string, int) {
	var emails []string
	count := 0
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(file)

	// Expand scanner buffer to support lines up to 1MB (default is 64KB)
	scannerBuf := make([]byte, 0, 64*1024)
	scanner.Buffer(scannerBuf, 1*1024*1024)

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
			email := strings.ToLower(strings.TrimSpace(part))
			if email != "" {
				count++
				// Basic sanity check before adding to raw list
				if strings.Contains(email, "@") {
					if !seen[email] {
						seen[email] = true
						emails = append(emails, email)
						// Enforce memory cap early
						if len(emails) > maxLimit {
							return emails, count
						}
					}
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		logger.Error("Error reading uploaded file", "error", err)
	}
	return emails, count
}
