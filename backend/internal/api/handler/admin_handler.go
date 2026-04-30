package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"

	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	adminService  service.AdminService
	logService    service.LogService
	domainService service.DomainService
	serverService service.ServerService
	packageService service.PackageService
	settingsService service.SettingsService
	systemService   service.SystemService
}

func NewAdminHandler(adminService service.AdminService, logService service.LogService, domainService service.DomainService, serverService service.ServerService, packageService service.PackageService, settingsService service.SettingsService, systemService service.SystemService) *AdminHandler {
	return &AdminHandler{
		adminService:    adminService,
		logService:      logService,
		domainService:   domainService,
		serverService:   serverService,
		packageService:  packageService,
		settingsService: settingsService,
		systemService:   systemService,
	}
}

// Logs
// Logs (moved to admin_logs.go)

// Domains
// Domains (moved to admin_domain.go)

// Servers
// Servers (moved to admin_server.go)
// Packages (moved to admin_package.go)

// User Management
func (h *AdminHandler) AdminStats(c *gin.Context) {
	stats, err := h.adminService.GetAdminStats()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch stats", err.Error())
		return
	}
	helper.SendSuccess(c, "Admin stats retrieved", stats)
}

func (h *AdminHandler) GetAllUsers(c *gin.Context) {
	users, err := h.adminService.GetAllUsers()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch users", err.Error())
		return
	}
	helper.SendSuccess(c, "Users retrieved", users)
}

func (h *AdminHandler) UserAction(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		Action       string  `json:"action" binding:"required"`
		TargetUserID uint    `json:"user_id" binding:"required"`
		Status       string  `json:"status"`
		Role         string  `json:"role"`
		Amount       int     `json:"amount"`
		AmountPaid   float64 `json:"amount_paid"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	err := h.adminService.UserAction(input.Action, input.TargetUserID, adminID.(uint), input.Status, input.Role, input.Amount, input.AmountPaid)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Action failed", err.Error())
		return
	}

	helper.SendSuccess(c, "User action completed successfully", nil)
}

// Settings (moved to admin_settings.go)

// System & Backups (moved to admin_system.go)

// Additional Admin Actions
func (h *AdminHandler) AdminJobStats(c *gin.Context) {
	stats, _ := h.adminService.GetJobStats()
	helper.SendSuccess(c, "Job stats retrieved", stats)
}

func (h *AdminHandler) AdminJobCleanup(c *gin.Context) {
	var input struct {
		Days int `json:"days" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}
	count, _ := h.adminService.CleanupJobs(input.Days)
	helper.SendSuccess(c, "Cleanup completed", gin.H{"deleted_count": count})
}

// User Actions (moved to admin_credits.go / admin_domain.go)

// Worker Key (moved to admin_server.go)

func (h *AdminHandler) AdminDownloadAllJobs(c *gin.Context) {
	jobType := c.Query("type")
	if jobType == "" {
		jobType = "all"
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"verification-results-%s-%s.csv\"", jobType, time.Now().Format("2006-01-02")))
	c.Writer.Write([]byte("\xEF\xBB\xBF"))

	writer := csv.NewWriter(c.Writer)
	writer.Write([]string{"Email", "Status", "Reason", "Catch-All", "Score", "Verified At", "Job ID"})

	query := config.DB.Model(&model.JobResult{}).
		Joins("JOIN jobs ON jobs.id = job_results.job_id").
		Select("job_results.*, jobs.job_id as legacy_job_id")

	switch jobType {
	case "single":
		query = query.Where("jobs.job_type = ?", "single")
	case "bulk":
		query = query.Where("jobs.job_type = ?", "bulk")
	}

	rows, err := query.Order("job_results.created_at DESC").Rows()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch results", err.Error())
		return
	}
	defer rows.Close()

	for rows.Next() {
		var res struct {
			model.JobResult
			LegacyJobID string `gorm:"column:legacy_job_id"`
		}
		config.DB.ScanRows(rows, &res)

		catchAll := "No"
		if res.IsCatchAll {
			catchAll = "Yes"
		}

		writer.Write([]string{
			res.Email,
			res.Status,
			res.Reason,
			catchAll,
			fmt.Sprintf("%d", res.Score),
			res.CreatedAt.Format("2006-01-02 15:04:05"),
			res.LegacyJobID,
		})
		writer.Flush()
	}
}
