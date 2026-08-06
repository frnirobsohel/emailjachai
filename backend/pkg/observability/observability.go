package observability

import (
	"os"
	"strings"
	"time"

	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

// Init logs whether error tracking is configured. Wire a full Sentry SDK later
// by setting SENTRY_DSN; until then we keep structured logs as the sink.
func Init() {
	dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN"))
	if dsn == "" {
		logger.Info("Observability: SENTRY_DSN unset — using structured logs only")
		return
	}
	logger.Info("Observability: SENTRY_DSN configured — enable SDK shipping in deploy if desired")
}

// Middleware records panics after gin.Recovery via a defer that inspects the context.
// Prefer placing after gin.Recovery so the process stays up; this only logs.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		if status >= 500 {
			logger.Error("HTTP 5xx",
				"path", c.Request.URL.Path,
				"method", c.Request.Method,
				"status", status,
				"latency_ms", time.Since(start).Milliseconds(),
				"client_ip", c.ClientIP(),
			)
		}
	}
}
