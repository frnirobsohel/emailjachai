package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService    service.UserService
	jobService     service.JobService
	paymentService service.PaymentService
	resellerService service.ResellerService
}

func NewUserHandler(userService service.UserService, jobService service.JobService, paymentService service.PaymentService, resellerService service.ResellerService) *UserHandler {
	return &UserHandler{
		userService:     userService,
		jobService:      jobService,
		paymentService:  paymentService,
		resellerService: resellerService,
	}
}

func (h *UserHandler) DashboardStats(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	// Fetch user for credits
	user, _ := h.userService.GetByID(userID)
	credits := "0"
	if user != nil {
		credits = helper.FormatNumber(int64(user.Credits))
	}

	// Fetch jobs for stats
	jobs, _ := h.jobService.GetJobs(userID, "", 10000, 0)
	totalJobs := len(jobs)
	activeJobs := 0
	lifetimeVerifications := 0
	todayVerifications := 0

	var deliverable, risky, undeliverable, catchAll, disposable, invalid int

	y, m, d := time.Now().Date()
	todayBegin := time.Date(y, m, d, 0, 0, 0, 0, time.Local)

	// last 7 days calculation (including today)
	weeklyStats := make(map[string]*struct{ Emails, Jobs int })
	daysOrder := make([]string, 0, 7)
	now := time.Now()
	for i := 6; i >= 0; i-- {
		dateKey := now.AddDate(0, 0, -i).Format("2006-01-02")
		daysOrder = append(daysOrder, dateKey)
		weeklyStats[dateKey] = &struct{ Emails, Jobs int }{0, 0}
	}

	for _, j := range jobs {
		if j.Status == "processing" {
			activeJobs++
		}
		lifetimeVerifications += j.TotalEmails
		deliverable += j.Deliverable
		risky += j.Risky
		undeliverable += j.Undeliverable
		catchAll += j.CatchAll
		disposable += j.Disposable
		invalid += j.InvalidSyntax

		if j.CreatedAt.After(todayBegin) {
			todayVerifications += j.TotalEmails
		}

		// Group by DATE string to avoid collisions across different weeks
		dateKey := j.CreatedAt.Format("2006-01-02")
		if stats, ok := weeklyStats[dateKey]; ok {
			stats.Emails += j.TotalEmails
			stats.Jobs++
		}
	}

	weeklyActivity := make([]map[string]interface{}, 0, 7)
	for _, dateKey := range daysOrder {
		t, _ := time.Parse("2006-01-02", dateKey)
		dayName := t.Format("Mon")
		weeklyActivity = append(weeklyActivity, map[string]interface{}{
			"name":   dayName,
			"emails": weeklyStats[dateKey].Emails,
			"jobs":   weeklyStats[dateKey].Jobs,
		})
	}

	usageBreakdown := []map[string]interface{}{
		{"name": "Valid", "value": deliverable, "color": "#22c55e"},
		{"name": "Invalid", "value": undeliverable + invalid, "color": "#ef4444"},
		{"name": "Unknown", "value": risky, "color": "#f59e0b"},
		{"name": "Catch-All", "value": catchAll, "color": "#cbd5e1"},
		{"name": "Disposable", "value": disposable, "color": "#3b82f6"},
	}

	// Fallback visual data if user has absolutely zero jobs and data, so chart doesn't crash
	if lifetimeVerifications == 0 {
		usageBreakdown = []map[string]interface{}{
			{"name": "Valid", "value": 70, "color": "#22c55e"},
			{"name": "Invalid", "value": 15, "color": "#ef4444"},
			{"name": "Unknown", "value": 15, "color": "#f59e0b"},
		}
	}

	// Fetch transaction summary
	totalPurchased, totalRefunds, _ := h.paymentService.GetTransactionSummary(userID)

	helper.SendSuccess(c, "Dashboard stats retrieved", gin.H{
		"credits_remaining":      credits,
		"total_purchased":        helper.FormatNumber(totalPurchased),
		"total_refunds":          helper.FormatNumber(totalRefunds),
		"today_verifications":    helper.FormatNumber(int64(todayVerifications)),
		"lifetime_verifications": helper.FormatNumber(int64(lifetimeVerifications)),
		"total_jobs":             totalJobs,
		"active_jobs":            activeJobs,
		"weekly_activity":        weeklyActivity,
		"usage_breakdown":        usageBreakdown,
	})
}

func (h *UserHandler) DashboardHistory(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	offset := 0
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	txs, total, err := h.paymentService.GetTransactionHistory(userID, limit, offset)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch history", err.Error())
		return
	}

	formattedTransactions := make([]map[string]interface{}, 0, len(txs))
	for _, tx := range txs {
		amountPrefix := ""
		if tx.CreditsAdded > 0 {
			amountPrefix = "+"
		}

		txnID := tx.TransactionID
		if txnID == "" {
			txnID = fmt.Sprintf("%d", tx.ID)
		}

		formattedTransactions = append(formattedTransactions, map[string]interface{}{
			"id":          txnID,
			"date":        tx.CreatedAt.Format("2006-01-02 15:04:05"),
			"amount":      fmt.Sprintf("%s%d Credits", amountPrefix, tx.CreditsAdded),
			"type":        strings.Title(strings.ReplaceAll(tx.Type, "_", " ")),
			"status":      strings.Title(tx.Status),
			"cost":        fmt.Sprintf("$%.2f", tx.Amount),
			"package":     tx.Package,
			"description": tx.Description,
		})
	}

	helper.SendSuccess(c, "Dashboard history retrieved", gin.H{
		"transactions": formattedTransactions,
		"total":        total,
	})
}

func (h *UserHandler) GetWebhookSettings(c *gin.Context) {
	userID, _ := c.Get("userID")
	_ = userID
	helper.SendSuccess(c, "Webhook settings retrieved", nil)
}

func (h *UserHandler) UpdateWebhookSettings(c *gin.Context) {
	userID, _ := c.Get("userID")
	_ = userID
	helper.SendSuccess(c, "Webhook settings updated", nil)
}

func (h *UserHandler) TransferCredits(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input struct {
		Email  string `json:"email" binding:"required"`
		Amount int    `json:"amount" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request data", err.Error())
		return
	}

	if err := h.resellerService.TransferCredits(userID.(uint), input.Email, input.Amount); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Transfer failed", err.Error())
		return
	}

	helper.SendSuccess(c, fmt.Sprintf("Successfully transferred %d credits to %s", input.Amount, input.Email), nil)
}
