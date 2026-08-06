package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware() gin.HandlerFunc {
	// Read allowed origins from env. Localhost default is development-only;
	// production must set CORS_ORIGINS (enforced by config.ValidateProductionConfig).
	allowedOriginsEnv := os.Getenv("CORS_ORIGINS")
	if allowedOriginsEnv == "" {
		if strings.EqualFold(os.Getenv("GO_ENV"), "production") ||
			strings.EqualFold(os.Getenv("ENVIRONMENT"), "production") {
			allowedOriginsEnv = ""
		} else {
			allowedOriginsEnv = "http://localhost:3000,http://localhost:8000"
		}
	}
	allowedOrigins := strings.Split(allowedOriginsEnv, ",")
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		cleaned := strings.ToLower(strings.TrimRight(strings.TrimSpace(o), "/"))
		if cleaned != "" {
			originSet[cleaned] = struct{}{}
		}
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		cleanedOrigin := strings.ToLower(strings.TrimRight(strings.TrimSpace(origin), "/"))

		// Check if the request origin is in our allowed list
		if _, ok := originSet[cleanedOrigin]; ok {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
