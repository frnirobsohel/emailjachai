package middleware

import (
	"net/http"

	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// AdminMiddleware ensures the user has an 'admin' role
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role != "admin" {
			helper.SendError(c, http.StatusForbidden, "Unauthorized access. Admin privileges required.", "ERR_FORBIDDEN")
			c.Abort()
			return
		}
		c.Next()
	}
}



