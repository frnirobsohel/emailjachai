package handler

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/service"
	"ejp-backend/internal/storage"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
)

type WorkerHandler struct {
	workerService service.WorkerService
	cacheRepo     repo.CacheRepository
	logRepo       repo.LogRepo
}

func NewWorkerHandler(workerService service.WorkerService, cacheRepo repo.CacheRepository, logRepo repo.LogRepo) *WorkerHandler {
	return &WorkerHandler{
		workerService: workerService,
		cacheRepo:     cacheRepo,
		logRepo:       logRepo,
	}
}

func (h *WorkerHandler) ClaimTask(c *gin.Context) {
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	task, err := h.workerService.ClaimTask(input.ServerName)
	if err != nil {
		if err.Error() == "no tasks available" {
			helper.SendSuccess(c, "No tasks available", nil)
			return
		}
		helper.SendError(c, http.StatusInternalServerError, "Failed to claim task", err.Error())
		return
	}

	helper.SendSuccess(c, "Task claimed", task)
}

func (h *WorkerHandler) CompleteTask(c *gin.Context) {
	var input struct {
		TaskID uint   `json:"task_id" binding:"required"`
		Status string `json:"status" binding:"required"` // completed or failed
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if err := h.workerService.CompleteTask(input.TaskID, input.Status); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update task status", err.Error())
		return
	}

	if strings.EqualFold(input.Status, "failed") && h.logRepo != nil {
		_ = h.logRepo.Create(&model.ActivityLog{
			Level:   "WARN",
			Source:  "Worker",
			Event:   "Task Failed",
			Message: fmt.Sprintf("Worker reported task #%d as failed", input.TaskID),
		})
	}

	helper.SendSuccess(c, "Task status updated", nil)
}

func (h *WorkerHandler) ResetWorkerTasks(c *gin.Context) {
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	rowsAffected, err := h.workerService.ResetWorkerTasks(input.ServerName)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to reset tasks", err.Error())
		return
	}

	if rowsAffected > 0 && h.logRepo != nil {
		_ = h.logRepo.Create(&model.ActivityLog{
			Level:      "WARN",
			Source:     "Worker",
			Event:      "Zombie Recovery",
			Message:    fmt.Sprintf("Worker %s reset %d zombie task(s)", input.ServerName, rowsAffected),
			Identifier: input.ServerName,
		})
	}

	helper.SendSuccess(c, fmt.Sprintf("Reset %d tasks", rowsAffected), nil)
}

func (h *WorkerHandler) GetWorkerDomains(c *gin.Context) {
	domains, err := h.workerService.GetWorkerDomains()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch domains", "ERR_WORKER_DOMAINS")
		return
	}

	c.Header("X-Domain-Revision", strconv.FormatInt(config.GetDomainCacheRevision(), 10))
	helper.SendSuccess(c, "Domains retrieved", domains)
}

func (h *WorkerHandler) ReportTaskResult(c *gin.Context) {
	var payload service.WorkerReportPayload
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

	job, _, err := h.workerService.ReportTaskResult(&payload)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to record result", err.Error())
		return
	}

	h.workerService.BroadcastJobUpdate(job.JobID)
	helper.SendSuccess(c, "Result recorded", nil)

	// Async: persist result to ndjson file (bulk jobs only)
	if job.JobType == "bulk" {
		jIDCopy := job.JobID
		eAddrCopy := email
		stCopy := status
		resultPathCopy := job.ResultFilePath
		pCopy := payload
		safe.Go(func() {
			jID := jIDCopy
			eAddr := eAddrCopy
			st := stCopy
			resultPath := resultPathCopy
			p := pCopy
			basePath := os.Getenv("BULK_RESULTS_PATH")
			if basePath == "" {
				basePath = "./storage/results/bulk"
			}
			row := storage.ResultRow{
				JobID:      jID,
				Email:      eAddr,
				Status:     st,
				Score:      p.Score,
				Reason:     p.Reason,
				MxRecords:  p.MxRecords,
				VerifiedAt: time.Now(),
			}
			if p.IsCatchAll != nil {
				row.IsCatchAll = *p.IsCatchAll
			}
			if p.IsDeliverable != nil {
				row.IsDeliverable = *p.IsDeliverable
			}
			if p.IsDisposable != nil {
				row.IsDisposable = *p.IsDisposable
			}
			if p.HasMx != nil {
				row.HasMx = *p.HasMx
			}
			filePath, err := storage.AppendResult(basePath, jID, row)
			if err != nil {
				logger.Error("ndjson: failed to append result", "job_id", jID, "error", err)
				return
			}
			// Update ResultFilePath in DB if not already set
			if resultPath == "" && filePath != "" {
				_ = h.workerService.UpdateResultFilePath(jID, filePath)
			}

			// Upsert to Email Cache
			cacheRows := []model.EmailCache{{
				Email:          row.Email,
				Status:         row.Status,
				Score:          row.Score,
				Reason:         row.Reason,
				IsCatchAll:     row.IsCatchAll,
				IsDeliverable:  row.IsDeliverable,
				IsDisposable:   row.IsDisposable,
				HasMx:          row.HasMx,
				ProcessingTime: p.TimeTaken,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}}
			if err := h.cacheRepo.UpsertEmailCacheBatch(cacheRows); err != nil {
				logger.Error("failed to upsert email cache", "error", err)
			}
		})
	}
}

func (h *WorkerHandler) ReportTaskResults(c *gin.Context) {
	var payload service.WorkerBatchPayload
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

	job, newRows, err := h.workerService.ReportTaskResults(&payload)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to record results", err.Error())
		return
	}

	h.workerService.BroadcastJobUpdate(job.JobID)
	helper.SendSuccess(c, "Batch results recorded", nil)

	// Async: persist batch to ndjson file
	if len(newRows) > 0 && job.JobType == "bulk" {
		jIDCopy := job.JobID
		rowsCopy := newRows
		safe.Go(func() {
			jID := jIDCopy
			rows := rowsCopy
			basePath := os.Getenv("BULK_RESULTS_PATH")
			if basePath == "" {
				basePath = "./storage/results/bulk"
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
					MxRecords:      r.MxRecords,
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
			if job.ResultFilePath == "" && filePath != "" {
				_ = h.workerService.UpdateResultFilePath(job.JobID, filePath)
			}

			// Upsert to Email Cache
			cacheRows := make([]model.EmailCache, 0, len(rows))
			for _, r := range rows {
				cacheRows = append(cacheRows, model.EmailCache{
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
					UserExists:     r.UserExists,
					IsSyntaxValid:  r.IsSyntaxValid,
					IsSpamTrap:     r.IsSpamTrap,
					IsBlacklisted:  r.IsBlacklisted,
					MailboxFull:    r.MailboxFull,
					ProcessingTime: r.ProcessingTime,
					CreatedAt:      time.Now(),
					UpdatedAt:      time.Now(),
				})
			}
			if err := h.cacheRepo.UpsertEmailCacheBatch(cacheRows); err != nil {
				logger.Error("failed to upsert email cache batch", "error", err)
			}
		})
	}
}
