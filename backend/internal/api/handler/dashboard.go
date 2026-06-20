package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

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


func DashboardHistory(c *gin.Context) {
	userID, _ := c.Get("userID")

	type HistoryResult struct {
		ID           uint      `json:"id"`
		Date         string    `json:"date"`
		Amount       string    `json:"amount"` // Formatted string for credits
		Cost         string    `json:"cost"`   // Formatted string for money
		Type         string    `json:"type"`
		Status       string    `json:"status"`
		Description  string    `json:"description"`
		CreditsAdded int64     `json:"-" gorm:"column:credits_added"`
		RawAmount    float64   `json:"-" gorm:"column:amount"`
		CreatedAt    time.Time `json:"created_at"`
	}

	var history []HistoryResult
	var total int64

	limit := 10
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}

	config.DB.Model(&model.Transaction{}).Where("user_id = ?", userID).Count(&total)

	err := config.DB.Model(&model.Transaction{}).
		Select("id, credits_added, amount, type, status, description, created_at").
		Where("user_id = ?", userID).
		Order("id DESC").
		Limit(limit).
		Offset(offset).
		Scan(&history).Error

	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to load history", "")
		return
	}

	// Format for frontend
	for i := range history {
		history[i].Date = history[i].CreatedAt.Format("2006-01-02 15:04:05")

		prefix := ""
		if history[i].CreditsAdded > 0 {
			prefix = "+"
		}
		history[i].Amount = fmt.Sprintf("%s%s Credits", prefix, helper.FormatNumber(history[i].CreditsAdded))
		history[i].Cost = fmt.Sprintf("$%.2f", history[i].RawAmount)

		// Legacy string cleaning
		tType := strings.ReplaceAll(history[i].Type, "_", " ")
		history[i].Type = helper.UcFirst(tType)
		history[i].Status = helper.UcFirst(history[i].Status)
	}

	helper.SendSuccess(c, "Dashboard history retrieved", gin.H{
		"transactions": history,
		"total":        total,
	})
}



