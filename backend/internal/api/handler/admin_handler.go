package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"

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
	if cached, ok := config.GetCachedAdminStats(); ok {
		helper.SendSuccess(c, "Admin stats retrieved (cached)", cached)
		return
	}

	stats, err := h.adminService.GetAdminStats()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch stats", err.Error())
		return
	}

	config.SetCachedAdminStats(stats, 1*time.Minute)
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

	rows, err := h.adminService.AdminDownloadAllJobs(jobType)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch results", err.Error())
		return
	}
	defer rows.Close()

	for rows.Next() {
		var email, status, reason, legacyJobID string
		var isCatchAll bool
		var score int
		var createdAt time.Time
		if err := rows.Scan(&email, &status, &reason, &isCatchAll, &score, &createdAt, &legacyJobID); err != nil {
			continue
		}

		catchAll := "No"
		if isCatchAll {
			catchAll = "Yes"
		}

		writer.Write([]string{
			email,
			status,
			reason,
			catchAll,
			fmt.Sprintf("%d", score),
			createdAt.Format("2006-01-02 15:04:05"),
			legacyJobID,
		})
		writer.Flush()
	}
}

func (h *AdminHandler) CreateUser(c *gin.Context) {
	var input struct {
		Name     string `json:"name" binding:"required"`
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=6"`
		Role     string `json:"role" binding:"required"`
		Credits  int    `json:"credits"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	err := h.adminService.CreateUser(input.Name, input.Email, input.Password, input.Role, input.Credits)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "User created successfully", nil)
}

func (h *AdminHandler) EditUser(c *gin.Context) {
	var input struct {
		ID    uint   `json:"id" binding:"required"`
		Name  string `json:"name" binding:"required"`
		Email string `json:"email" binding:"required,email"`
		Role  string `json:"role" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	err := h.adminService.EditUser(input.ID, input.Name, input.Email, input.Role)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "User profile updated successfully", nil)
}
