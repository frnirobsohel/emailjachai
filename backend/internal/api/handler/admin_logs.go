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
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var logs []model.ActivityLog
	var total int64

	// Get total count
	config.DB.Model(&model.ActivityLog{}).Count(&total)

	// Fetch logs with user join for parity
	err := config.DB.Table("activity_logs").
		Select("activity_logs.*, users.name as user_name, activity_logs.created_at as time").
		Joins("LEFT JOIN users ON activity_logs.user_id = users.id").
		Order("activity_logs.created_at DESC").
		Limit(limit).
		Offset(offset).
		Scan(&logs).Error

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

	// Use Exec to truncate
	if err := config.DB.Exec("TRUNCATE TABLE activity_logs").Error; err != nil {
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



