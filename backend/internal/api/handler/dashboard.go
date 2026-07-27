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
	// Drop stale cache first so the next /dashboard/stats read cannot return
	// a pre-mutation balance, then recompute in the background.
	service.InvalidateAndRefreshDashboardStats(userID)
}



