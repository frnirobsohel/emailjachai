package handler

import (
	"net/http"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// Ping responds with a simple JSON message (Legacy Compatibility)
func Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "pong",
	})
}

// HealthCheck matches the legacy PHP HealthController logic
func HealthCheck(c *gin.Context) {
	dbStatus := "offline"
	sqlDB, err := config.DB.DB()
	if err == nil {
		if err := sqlDB.Ping(); err == nil {
			dbStatus = "online"
		}
	}

	helper.SendSuccess(c, "System is healthy", gin.H{
		"status":   "online",
		"database": dbStatus,
		"time":     time.Now().Format("2006-01-02 15:04:05"),
		"version":  "1.0.0-pro",
	})
}



