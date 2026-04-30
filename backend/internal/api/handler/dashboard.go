package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// Cache is now managed in internal/config/cache.go to avoid circular dependencies

func DashboardStats(c *gin.Context) {
	userID, _ := c.Get("userID")
	uID := userID.(uint)

	// Legacy Parity: 60s Cache
	if data, ok := config.GetCachedStats(uID); ok {
		helper.SendSuccess(c, "Dashboard stats retrieved (cached)", data)
		return
	}

	// 1. User & Transaction Summary
	var user model.User
	config.DB.Select("credits").First(&user, userID)

	var transSummary struct {
		TotalPurchased int64 `gorm:"total_purchased"`
		TotalRefunds   int64 `gorm:"total_refunds"`
	}
	config.DB.Model(&model.Transaction{}).
		Select(`
			SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN credits_added ELSE 0 END) as total_purchased,
			ABS(SUM(CASE WHEN type = 'refund' AND status = 'completed' THEN credits_added ELSE 0 END)) as total_refunds
		`).
		Where("user_id = ?", userID).
		Scan(&transSummary)

	// 2. Job Statistics Summary
	var jobSummary struct {
		TotalVerifications int64 `gorm:"total_verifications"`
		TotalJobs          int64 `gorm:"total_jobs"`
		ActiveJobs         int64 `gorm:"active_jobs"`
		TodayVerifications int64 `gorm:"today_verifications"`
		DeliverableTotal   int64 `gorm:"deliverable_total"`
		RiskyTotal         int64 `gorm:"risky_total"`
		UndeliverableTotal int64 `gorm:"undeliverable_total"`
		CatchAllTotal      int64 `gorm:"catch_all_total"`
		DisposableTotal    int64 `gorm:"disposable_total"`
		InvalidSyntaxTotal int64 `gorm:"invalid_syntax_total"`
		RoleAccountsTotal  int64 `gorm:"role_accounts_total"`
	}

	// Use 'type' column (mapped from JobType model)
	config.DB.Model(&model.Job{}).
		Select(`
			SUM(processed_count) as total_verifications,
			COUNT(CASE WHEN type = 'bulk' THEN 1 END) as total_jobs,
			COUNT(CASE WHEN type = 'bulk' AND status IN ('pending', 'processing') THEN 1 END) as active_jobs,
			SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN processed_count ELSE 0 END) as today_verifications,
			SUM(deliverable) as deliverable_total,
			SUM(risky) as risky_total,
			SUM(undeliverable) as undeliverable_total,
			SUM(catch_all) as catch_all_total,
			SUM(disposable) as disposable_total,
			SUM(invalid_syntax) as invalid_syntax_total,
			SUM(role_accounts) as role_accounts_total
		`).
		Where("user_id = ?", userID).
		Scan(&jobSummary)

	// 3. Deleted Job Summary
	var deletedSummary model.DeletedJobStats
	config.DB.Where("user_id = ?", userID).First(&deletedSummary)

	totalVerifications := jobSummary.TotalVerifications + deletedSummary.TotalVerifications
	totalJobs := jobSummary.TotalJobs + deletedSummary.TotalJobs
	todayVerifications := jobSummary.TodayVerifications

	breakdown := gin.H{
		"deliverable":    jobSummary.DeliverableTotal + deletedSummary.Deliverable,
		"risky":          jobSummary.RiskyTotal + deletedSummary.Risky,
		"undeliverable":  jobSummary.UndeliverableTotal + deletedSummary.Undeliverable,
		"catch_all":      jobSummary.CatchAllTotal + deletedSummary.CatchAll,
		"disposable":     jobSummary.DisposableTotal + deletedSummary.Disposable,
		"invalid_syntax": jobSummary.InvalidSyntaxTotal + deletedSummary.InvalidSyntax,
		"role_accounts":  jobSummary.RoleAccountsTotal + deletedSummary.RoleAccounts,
	}

	// Usage Breakdown for Pie Chart (Legacy Colors)
	usageBreakdown := []gin.H{
		{"name": "Valid", "value": breakdown["deliverable"], "color": "#22c55e"},
		{"name": "Unknown", "value": breakdown["risky"], "color": "#f59e0b"},
		{"name": "Invalid", "value": breakdown["undeliverable"], "color": "#ef4444"},
		{"name": "Catch-All", "value": breakdown["catch_all"], "color": "#cbd5e1"},
		{"name": "Disposable", "value": breakdown["disposable"], "color": "#3b82f6"},
	}

	// 4. Weekly Activity (Last 7 days)
	type dailyAgg struct {
		Day    string `gorm:"column:day"`
		Emails int64  `gorm:"column:emails"`
		Jobs   int64  `gorm:"column:jobs"`
	}

	jobsDaily := make([]dailyAgg, 0, 7)
	config.DB.Raw(`
		SELECT
			TO_CHAR(DATE(created_at), 'YYYY-MM-DD') as day,
			COALESCE(SUM(processed_count), 0) as emails,
			COALESCE(COUNT(*), 0) as jobs
		FROM jobs
		WHERE user_id = ? AND DATE(created_at) >= CURRENT_DATE - INTERVAL '6 days'
		GROUP BY DATE(created_at)
	`, userID).Scan(&jobsDaily)

	deletedDaily := make([]dailyAgg, 0, 7)
	config.DB.Raw(`
		SELECT
			activity_date as day,
			COALESCE(SUM(emails), 0) as emails,
			COALESCE(SUM(jobs), 0) as jobs
		FROM deleted_job_daily_stats
		WHERE user_id = ? AND activity_date >= TO_CHAR(CURRENT_DATE - INTERVAL '6 days', 'YYYY-MM-DD')
		GROUP BY activity_date
	`, userID).Scan(&deletedDaily)

	dailyMap := make(map[string]dailyAgg, 7)
	for _, row := range jobsDaily {
		dailyMap[row.Day] = row
	}
	for _, row := range deletedDaily {
		current := dailyMap[row.Day]
		current.Day = row.Day
		current.Emails += row.Emails
		current.Jobs += row.Jobs
		dailyMap[row.Day] = current
	}

	var weeklyActivity []gin.H
	for i := 6; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i)
		date := d.Format("2006-01-02")
		dayName := d.Format("Mon")
		stats := dailyMap[date]

		weeklyActivity = append(weeklyActivity, gin.H{
			"name":   dayName,
			"emails": stats.Emails,
			"jobs":   stats.Jobs,
		})

		if date == time.Now().Format("2006-01-02") {
			todayVerifications += stats.Emails - jobSummary.TodayVerifications
		}
	}

	finalData := gin.H{
		"credits_remaining":      helper.FormatNumber(int64(user.Credits)),
		"total_purchased":        helper.FormatNumber(transSummary.TotalPurchased),
		"total_refunds":          helper.FormatNumber(transSummary.TotalRefunds),
		"lifetime_verifications": helper.FormatNumber(totalVerifications),
		"total_jobs":             totalJobs,
		"active_jobs":            jobSummary.ActiveJobs,
		"today_verifications":    helper.FormatNumber(todayVerifications),
		"usage_breakdown":        usageBreakdown,
		"weekly_activity":        weeklyActivity,
	}

	// Update Cache
	config.SetCachedStats(uID, finalData, 60*time.Second)

	helper.SendSuccess(c, "Dashboard stats retrieved", finalData)
}

func ClearDashboardCache(userID uint) {
	config.ClearDashboardCache(userID)
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



