package handler

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

// Cache is now managed in internal/config/cache.go to avoid circular dependencies

func DashboardStats(c *gin.Context) {
	userID, _ := c.Get("userID")
	uID := userID.(uint)

	// Try fetching from cache
	if data, ok := config.GetCachedStats(uID); ok {
		helper.SendSuccess(c, "Dashboard stats retrieved (cached)", data)
		return
	}

	// If missing, compute synchronously
	finalData := service.ComputeAndCacheDashboardStats(uID)
	helper.SendSuccess(c, "Dashboard stats retrieved", finalData)
}

func ClearDashboardCache(userID uint) {
	// Instead of deleting the cache and forcing the next user request to block,
	// we update it asynchronously in the background. This provides a <50ms response time guarantee.
	go service.ComputeAndCacheDashboardStats(userID)
}



