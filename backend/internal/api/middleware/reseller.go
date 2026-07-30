package middleware

import (
	"net/http"

	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// ResellerOrAdminMiddleware allows reseller and admin roles only.
func ResellerOrAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || (role != "reseller" && role != "admin") {
			helper.SendError(c, http.StatusForbidden, "Only resellers or admins can transfer credits.", "ERR_FORBIDDEN")
			c.Abort()
			return
		}
		c.Next()
	}
}
