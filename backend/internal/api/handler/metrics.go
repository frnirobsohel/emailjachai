package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
)

// PrometheusMetrics exports system, database, and queue telemetry in standard Prometheus text format.
// Suitable for scraping by Prometheus, Grafana Agent, or Datadog.
func PrometheusMetrics(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	var sb strings.Builder

	// 1. Database metrics
	dbOnline := 0
	dbOpen := 0
	dbInUse := 0
	dbIdle := 0
	if config.DB != nil {
		if sqlDB, err := config.DB.DB(); err == nil {
			if err = sqlDB.PingContext(ctx); err == nil {
				dbOnline = 1
				stats := sqlDB.Stats()
				dbOpen = stats.OpenConnections
				dbInUse = stats.InUse
				dbIdle = stats.Idle
			}
		}
	}

	sb.WriteString("# HELP ejp_db_online PostgreSQL connection status (1 = online, 0 = offline)\n")
	sb.WriteString("# TYPE ejp_db_online gauge\n")
	fmt.Fprintf(&sb, "ejp_db_online %d\n\n", dbOnline)

	sb.WriteString("# HELP ejp_db_connections Current database connections\n")
	sb.WriteString("# TYPE ejp_db_connections gauge\n")
	fmt.Fprintf(&sb, "ejp_db_connections{state=\"open\"} %d\n", dbOpen)
	fmt.Fprintf(&sb, "ejp_db_connections{state=\"in_use\"} %d\n", dbInUse)
	fmt.Fprintf(&sb, "ejp_db_connections{state=\"idle\"} %d\n\n", dbIdle)

	// 2. Redis metrics
	redisOnline := 0
	var redisLatencyMs int64 = -1
	if config.Redis != nil {
		start := time.Now()
		if _, err := config.Redis.Ping(ctx).Result(); err == nil {
			redisOnline = 1
			redisLatencyMs = time.Since(start).Milliseconds()
		}
	}

	sb.WriteString("# HELP ejp_redis_online Redis connection status (1 = online, 0 = offline)\n")
	sb.WriteString("# TYPE ejp_redis_online gauge\n")
	fmt.Fprintf(&sb, "ejp_redis_online %d\n\n", redisOnline)

	if redisLatencyMs >= 0 {
		sb.WriteString("# HELP ejp_redis_latency_ms Redis ping latency in milliseconds\n")
		sb.WriteString("# TYPE ejp_redis_latency_ms gauge\n")
		fmt.Fprintf(&sb, "ejp_redis_latency_ms %d\n\n", redisLatencyMs)
	}

	// 3. Queue metrics (Asynq)
	queueActive := 0
	queuePending := 0
	queueRetry := 0
	queueCompleted := 0

	if config.Redis != nil && redisOnline == 1 {
		addr := config.Redis.Options().Addr
		password := config.Redis.Options().Password
		db := config.Redis.Options().DB
		inspector := asynq.NewInspector(asynq.RedisClientOpt{
			Addr:     addr,
			Password: password,
			DB:       db,
		})
		defer inspector.Close()

		if queues, err := inspector.Queues(); err == nil {
			for _, q := range queues {
				if info, err := inspector.GetQueueInfo(q); err == nil {
					queueActive += info.Active
					queuePending += info.Pending
					queueRetry += info.Retry
					queueCompleted += info.Completed
				}
			}
		}
	}

	sb.WriteString("# HELP ejp_queue_tasks Asynq tasks across all queues\n")
	sb.WriteString("# TYPE ejp_queue_tasks gauge\n")
	fmt.Fprintf(&sb, "ejp_queue_tasks{state=\"active\"} %d\n", queueActive)
	fmt.Fprintf(&sb, "ejp_queue_tasks{state=\"pending\"} %d\n", queuePending)
	fmt.Fprintf(&sb, "ejp_queue_tasks{state=\"retry\"} %d\n", queueRetry)
	fmt.Fprintf(&sb, "ejp_queue_tasks{state=\"completed\"} %d\n", queueCompleted)

	c.Data(http.StatusOK, "text/plain; version=0.04; charset=utf-8", []byte(sb.String()))
}
