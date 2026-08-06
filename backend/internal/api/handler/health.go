package handler

import (
	"context"
	"net/http"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
)

// Ping responds with a simple JSON message (Legacy Compatibility)
func Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "pong",
	})
}

// HealthCheck matches the legacy PHP HealthController telemetry shape and
// returns HTTP 503 when Postgres or Redis is down (orchestrator-safe).
func HealthCheck(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	// 1. Database Check
	dbStatus := "offline"
	dbOpen := 0
	dbInUse := 0
	dbIdle := 0
	if config.DB != nil {
		sqlDB, err := config.DB.DB()
		if err == nil {
			if err = sqlDB.PingContext(ctx); err == nil {
				dbStatus = "online"
				stats := sqlDB.Stats()
				dbOpen = stats.OpenConnections
				dbInUse = stats.InUse
				dbIdle = stats.Idle
			}
		}
	}

	// 2. Redis Check
	redisStatus := "offline"
	var redisLatencyMs int64 = -1
	if config.Redis != nil {
		start := time.Now()
		if _, err := config.Redis.Ping(ctx).Result(); err == nil {
			redisStatus = "online"
			redisLatencyMs = time.Since(start).Milliseconds()
		}
	}

	// 3. Asynq Queue Check
	asynqStatus := "offline"
	var totalLag int64 = 0
	queueBreakdown := make(map[string]interface{})

	if config.Redis != nil && redisStatus == "online" {
		addr := config.Redis.Options().Addr
		password := config.Redis.Options().Password
		db := config.Redis.Options().DB
		inspector := asynq.NewInspector(asynq.RedisClientOpt{
			Addr:     addr,
			Password: password,
			DB:       db,
		})
		defer inspector.Close()

		queues, err := inspector.Queues()
		if err == nil {
			asynqStatus = "online"
			for _, qname := range queues {
				qinfo, err := inspector.GetQueueInfo(qname)
				if err == nil {
					totalLag += int64(qinfo.Pending)
					queueBreakdown[qname] = gin.H{
						"size":      qinfo.Size,
						"active":    qinfo.Active,
						"pending":   qinfo.Pending,
						"scheduled": qinfo.Scheduled,
						"retry":     qinfo.Retry,
						"archived":  qinfo.Archived,
					}
				}
			}
		}
	}

	payload := gin.H{
		"status": "online",
		"database": gin.H{
			"status":           dbStatus,
			"open_connections": dbOpen,
			"in_use":           dbInUse,
			"idle":             dbIdle,
		},
		"cache": gin.H{
			"status":     redisStatus,
			"latency_ms": redisLatencyMs,
		},
		"queues": gin.H{
			"status":    asynqStatus,
			"total_lag": totalLag,
			"breakdown": queueBreakdown,
		},
		"time":    time.Now().Format("2006-01-02 15:04:05"),
		"version": config.Version,
		"author":  config.AuthorName,
	}

	if dbStatus == "offline" || redisStatus == "offline" {
		payload["status"] = "degraded"
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":    "error",
			"message":   "unhealthy",
			"data":      payload,
			"timestamp": time.Now().Unix(),
		})
		return
	}

	helper.SendSuccess(c, "System health telemetry", payload)
}
