package handler

import (
	"net/http"
	"strconv"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// GetLogs returns real activity logs from the database.
func (h *AdminHandler) GetLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}

	logs, total, err := h.logService.GetLogs(limit, offset)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch logs", err.Error())
		return
	}

	helper.SendSuccess(c, "Logs retrieved", gin.H{
		"logs":     logs,
		"total":    total,
		"has_more": int64(offset+limit) < total,
	})
}

// ClearLogs truncates the activity_logs table (Legacy Parity)
func (h *AdminHandler) ClearLogs(c *gin.Context) {
	adminID, _ := c.Get("userID")

	if err := h.logService.ClearLogs(); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to clear logs", err.Error())
		return
	}

	// Log this action
	logAction(adminID.(uint), "WARN", "Admin", "Activity logs cleared")

	helper.SendSuccess(c, "Logs cleared successfully", nil)
}

// Helper to log actions (Legacy Parity)
func logAction(userID uint, level, source, message string) {
	log := model.ActivityLog{
		UserID:  &userID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	config.DB.Create(&log)
}



