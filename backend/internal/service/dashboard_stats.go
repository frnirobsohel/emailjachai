package service

import (
	"context"
	"sync"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
)

// InvalidateAndRefreshDashboardStats drops the Redis stats cache immediately so
// /dashboard/stats cannot serve a pre-mutation credit balance, then recomputes async.
func InvalidateAndRefreshDashboardStats(uID uint) {
	config.ClearDashboardCache(uID)
	go ComputeAndCacheDashboardStats(uID)
}

func ComputeAndCacheDashboardStats(uID uint) gin.H {
	var wg sync.WaitGroup
	var user model.User
	var transSummary struct {
		TotalPurchased int64 `gorm:"total_purchased"`
		TotalRefunds   int64 `gorm:"total_refunds"`
	}
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
	var deletedSummary model.DeletedJobStats
	var todayDeleted int64
	type dailyAgg struct {
		Day    string `gorm:"column:day"`
		Emails int64  `gorm:"column:emails"`
		Jobs   int64  `gorm:"column:jobs"`
	}
	jobsDaily := make([]dailyAgg, 0, 7)
	deletedDaily := make([]dailyAgg, 0, 7)
	var dbToday time.Time
	var apiVerifications int64

	wg.Add(5)

	// Goroutine 1: User Credits & Transaction Summary
	safe.Go(func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := config.DB.WithContext(ctx)

		db.Select("credits").First(&user, uID)
		db.Model(&model.Transaction{}).
			Select(`
				SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN credits_added ELSE 0 END) as total_purchased,
				ABS(SUM(CASE WHEN type = 'refund' AND status = 'completed' THEN credits_added ELSE 0 END)) as total_refunds
			`).
			Where("user_id = ?", uID).
			Scan(&transSummary)
	})

	// Goroutine 2: Job Summary & Today's Verifications
	safe.Go(func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := config.DB.WithContext(ctx)

		db.Model(&model.Job{}).
			Select(`
				SUM(processed_count) as total_verifications,
				COUNT(CASE WHEN type = 'bulk' THEN 1 END) as total_jobs,
				COUNT(CASE WHEN type = 'bulk' AND status IN ('pending', 'processing') THEN 1 END) as active_jobs,
				SUM(CASE WHEN created_at >= CURRENT_DATE THEN processed_count ELSE 0 END) as today_verifications,
				SUM(deliverable) as deliverable_total,
				SUM(risky) as risky_total,
				SUM(undeliverable) as undeliverable_total,
				SUM(catch_all) as catch_all_total,
				SUM(disposable) as disposable_total,
				SUM(invalid_syntax) as invalid_syntax_total,
				SUM(role_accounts) as role_accounts_total
			`).
			Where("user_id = ?", uID).
			Scan(&jobSummary)
	})

	// Goroutine 3: Deleted Job Summary & Today's Deleted Verifications
	safe.Go(func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := config.DB.WithContext(ctx)

		db.Where("user_id = ?", uID).First(&deletedSummary)
		db.Raw(`SELECT COALESCE(SUM(emails), 0) FROM deleted_job_daily_stats WHERE user_id = ? AND activity_date = CURRENT_DATE`, uID).Scan(&todayDeleted)
	})

	// Goroutine 4: Weekly Activity & DB Time
	safe.Go(func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := config.DB.WithContext(ctx)

		db.Raw("SELECT CURRENT_DATE").Scan(&dbToday)
		if dbToday.IsZero() {
			dbToday = time.Now()
		}

		db.Raw(`
			SELECT
				TO_CHAR(created_at, 'YYYY-MM-DD') as day,
				COALESCE(SUM(processed_count), 0) as emails,
				COALESCE(COUNT(*), 0) as jobs
			FROM jobs
			WHERE user_id = ? AND created_at >= CURRENT_DATE - INTERVAL '6 days'
			GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
		`, uID).Scan(&jobsDaily)

		db.Raw(`
			SELECT
				TO_CHAR(activity_date, 'YYYY-MM-DD') as day,
				COALESCE(SUM(emails), 0) as emails,
				COALESCE(SUM(jobs), 0) as jobs
			FROM deleted_job_daily_stats
			WHERE user_id = ? AND activity_date >= CURRENT_DATE - INTERVAL '6 days'
			GROUP BY activity_date
		`, uID).Scan(&deletedDaily)
	})

	// Goroutine 5: API Verifications count (Optimized single subquery instead of N+1 pluck + IN)
	safe.Go(func() {
		defer wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		db := config.DB.WithContext(ctx)

		db.Model(&model.Job{}).
			Select("COALESCE(SUM(processed_count), 0)").
			Where("user_id = ? AND api_key_id IN (SELECT id FROM api_keys WHERE user_id = ? AND name NOT IN ('Login Key', 'Impersonation Key'))", uID, uID).
			Scan(&apiVerifications)
	})

	// Wait for all database queries to complete in parallel
	wg.Wait()

	// Post-processing
	totalVerifications := jobSummary.TotalVerifications + deletedSummary.TotalVerifications
	totalJobs := jobSummary.TotalJobs + deletedSummary.TotalJobs
	todayVerifications := jobSummary.TodayVerifications + todayDeleted

	breakdown := gin.H{
		"deliverable":    jobSummary.DeliverableTotal + deletedSummary.Deliverable,
		"risky":          jobSummary.RiskyTotal + deletedSummary.Risky,
		"undeliverable":  jobSummary.UndeliverableTotal + deletedSummary.Undeliverable,
		"catch_all":      jobSummary.CatchAllTotal + deletedSummary.CatchAll,
		"disposable":     jobSummary.DisposableTotal + deletedSummary.Disposable,
		"invalid_syntax": jobSummary.InvalidSyntaxTotal + deletedSummary.InvalidSyntax,
		"role_accounts":  jobSummary.RoleAccountsTotal + deletedSummary.RoleAccounts,
	}

	usageBreakdown := []gin.H{
		{"name": "Valid", "value": breakdown["deliverable"], "color": "#22c55e"},
		{"name": "Unknown", "value": breakdown["risky"], "color": "#f59e0b"},
		{"name": "Invalid", "value": breakdown["undeliverable"], "color": "#ef4444"},
		{"name": "Catch-All", "value": breakdown["catch_all"], "color": "#cbd5e1"},
		{"name": "Disposable", "value": breakdown["disposable"], "color": "#3b82f6"},
	}

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
		d := dbToday.AddDate(0, 0, -i)
		date := d.Format("2006-01-02")
		dayName := d.Format("Mon")
		stats := dailyMap[date]

		weeklyActivity = append(weeklyActivity, gin.H{
			"name":   dayName,
			"emails": stats.Emails,
			"jobs":   stats.Jobs,
		})
	}

	finalData := gin.H{
		"credits_remaining":      helper.FormatNumber(int64(user.Credits)),
		"total_purchased":        helper.FormatNumber(transSummary.TotalPurchased),
		"total_refunds":          helper.FormatNumber(transSummary.TotalRefunds),
		"lifetime_verifications": helper.FormatNumber(totalVerifications),
		"api_verifications":      helper.FormatNumber(apiVerifications),
		"total_jobs":             totalJobs,
		"active_jobs":            jobSummary.ActiveJobs,
		"today_verifications":    helper.FormatNumber(todayVerifications),
		"usage_breakdown":        usageBreakdown,
		"weekly_activity":        weeklyActivity,
	}

	// Update Cache with extended TTL (5 minutes) since we proactively refresh it
	config.SetCachedStats(uID, finalData, 5*time.Minute)
	
	// Broadcast real-time stats update to the user
	ws.GlobalHub.BroadcastToUser(uID, "user_stats_update", finalData)
	
	return finalData
}
