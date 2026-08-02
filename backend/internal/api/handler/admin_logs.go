package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

// GetLogs returns activity logs with optional level/q filters and cursor pagination.
func (h *AdminHandler) GetLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	filter := service.LogListFilter{
		Limit: limit,
		Level: strings.TrimSpace(c.Query("level")),
		Query: strings.TrimSpace(c.Query("q")),
	}

	if beforeIDRaw := strings.TrimSpace(c.Query("before_id")); beforeIDRaw != "" {
		beforeID, err := strconv.ParseUint(beforeIDRaw, 10, 64)
		if err != nil || beforeID == 0 {
			helper.SendError(c, http.StatusBadRequest, "Invalid before_id", "ERR_LOGS_BAD_CURSOR")
			return
		}
		beforeAtRaw := strings.TrimSpace(c.Query("before_created_at"))
		if beforeAtRaw == "" {
			helper.SendError(c, http.StatusBadRequest, "before_created_at is required with before_id", "ERR_LOGS_BAD_CURSOR")
			return
		}
		beforeAt, err := time.Parse(time.RFC3339, beforeAtRaw)
		if err != nil {
			beforeAt, err = time.ParseInLocation("2006-01-02 15:04:05", beforeAtRaw, time.UTC)
			if err != nil {
				helper.SendError(c, http.StatusBadRequest, "Invalid before_created_at", "ERR_LOGS_BAD_CURSOR")
				return
			}
		}
		filter.BeforeID = beforeID
		filter.BeforeCreatedAt = &beforeAt
	}

	logs, total, err := h.logService.GetLogs(filter)
	if err != nil {
		logger.Error("Failed to fetch activity logs", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch logs", "ERR_LOGS_FETCH")
		return
	}

	hasMore := len(logs) == limit
	var nextBeforeID uint64
	var nextBeforeCreatedAt string
	if hasMore && len(logs) > 0 {
		last := logs[len(logs)-1]
		nextBeforeID = last.ID
		nextBeforeCreatedAt = last.CreatedAt.UTC().Format(time.RFC3339)
	}

	helper.SendSuccess(c, "Logs retrieved", gin.H{
		"logs":                   logs,
		"total":                  total,
		"has_more":               hasMore,
		"next_before_id":         nextBeforeID,
		"next_before_created_at": nextBeforeCreatedAt,
	})
}

// ClearLogs deletes operational activity logs while preserving Auth Login Failed rows.
func (h *AdminHandler) ClearLogs(c *gin.Context) {
	adminIDVal, exists := c.Get("userID")
	if !exists {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	_, result, err := h.logService.ClearLogs(adminID)
	if err != nil {
		logger.Error("Failed to clear activity logs", "error", err, "admin_id", adminID)
		helper.SendError(c, http.StatusInternalServerError, "Failed to clear logs", "ERR_LOGS_CLEAR")
		return
	}

	helper.SendSuccess(c, "Logs cleared successfully", gin.H{
		"deleted":                 result.Deleted,
		"auth_failures_preserved": result.Preserved,
	})
}

// logAction persists an admin activity row and broadcasts to connected admins.
func logAction(userID uint, level, source, message string) {
	entry := &model.ActivityLog{
		UserID:  &userID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	if err := repo.NewLogRepo().Create(entry); err != nil {
		logger.Error("Failed to write activity log", "error", err, "source", source)
	}
}
