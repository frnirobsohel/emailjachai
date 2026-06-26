package middleware

import (
	"time"

	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

// Logger returns a Gin middleware that logs HTTP requests using the project's Zap logger
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Process request
		c.Next()

		// Log after completion
		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method

		if len(c.Errors) > 0 {
			for _, e := range c.Errors.Errors() {
				logger.Error("HTTP Request Error",
					"status", status,
					"method", method,
					"path", path,
					"query", query,
					"ip", clientIP,
					"latency", latency,
					"error", e,
				)
			}
		} else {
			logger.Info("HTTP Request",
				"status", status,
				"method", method,
				"path", path,
				"query", query,
				"ip", clientIP,
				"latency", latency,
			)
		}
	}
}
