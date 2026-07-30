package handler

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/report"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	adminService    service.AdminService
	logService      service.LogService
	domainService   service.DomainService
	serverService   service.ServerService
	packageService  service.PackageService
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
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch admin stats.", "ERR_ADMIN_STATS")
		return
	}

	config.SetCachedAdminStats(stats, 1*time.Minute)
	helper.SendSuccess(c, "Admin stats retrieved", stats)
}

// StartAdminStatsBroadcaster starts a background ticker to periodically recalculate and broadcast stats.
func (h *AdminHandler) StartAdminStatsBroadcaster() {
	safe.Go(func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if ws.GlobalHub == nil || !ws.GlobalHub.HasAdminConnections() {
				continue
			}

			stats, err := h.adminService.GetAdminStats()
			if err == nil {
				config.SetCachedAdminStats(stats, 1*time.Minute)
				ws.GlobalHub.BroadcastToAdmins("admin_stats_update", stats)
			}
		}
	})
}

func (h *AdminHandler) GetAllUsers(c *gin.Context) {
	page := 1
	limit := 25
	if v := strings.TrimSpace(c.Query("page")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	q := c.Query("q")
	role := c.Query("role")

	result, err := h.adminService.ListUsers(q, role, page, limit)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch users.", "ERR_ADMIN_USERS")
		return
	}
	helper.SendSuccess(c, "Users retrieved", result)
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
		helper.SendError(c, http.StatusBadRequest, "Invalid request body.", "ERR_INVALID_REQUEST")
		return
	}

	err := h.adminService.UserAction(input.Action, input.TargetUserID, adminID.(uint), input.Status, input.Role, input.Amount, input.AmountPaid)
	if err != nil {
		mapAdminUserError(c, err)
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

	rows, err := h.adminService.AdminDownloadAllJobs(jobType)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch results", err.Error())
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"verification-results-%s-%s.csv\"", jobType, time.Now().Format("2006-01-02")))
	c.Writer.Write([]byte("\xEF\xBB\xBF"))

	writer := csv.NewWriter(c.Writer)
	writer.Write([]string{"Domain", "Email", "Status", "Score", "MX Record", "Reason", "Verified At", "Job ID"})

	for rows.Next() {
		var email, status, reason, legacyJobID string
		var isCatchAll bool
		var score int
		var createdAt time.Time
		var mxRecordsRaw []byte
		if err := rows.Scan(&email, &status, &reason, &isCatchAll, &score, &createdAt, &legacyJobID, &mxRecordsRaw); err != nil {
			continue
		}

		domain := report.GetDomainFromEmail(email)
		var mxRecords []string
		if len(mxRecordsRaw) > 0 {
			_ = json.Unmarshal(mxRecordsRaw, &mxRecords)
		}
		mxRecordsStr := strings.Join(mxRecords, "; ")
		friendlyReason := report.GetFriendlyReason(reason, status)

		writer.Write([]string{
			domain,
			email,
			status,
			fmt.Sprintf("%d", score),
			mxRecordsStr,
			friendlyReason,
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
		Password string `json:"password" binding:"required,strong_password"`
		Role     string `json:"role" binding:"required"`
		Credits  int    `json:"credits"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request. Password must be at least 8 characters with upper, lower, and a number.", "ERR_INVALID_REQUEST")
		return
	}

	err := h.adminService.CreateUser(input.Name, input.Email, input.Password, input.Role, input.Credits)
	if err != nil {
		mapAdminUserError(c, err)
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
		helper.SendError(c, http.StatusBadRequest, "Valid name, email, and role are required.", "ERR_INVALID_REQUEST")
		return
	}

	err := h.adminService.EditUser(input.ID, input.Name, input.Email, input.Role)
	if err != nil {
		mapAdminUserError(c, err)
		return
	}

	helper.SendSuccess(c, "User profile updated successfully", nil)
}

func mapAdminUserError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrAdminWeakPassword):
		helper.SendError(c, http.StatusBadRequest, "Password must be at least 8 characters and include upper, lower, and a number.", "ERR_WEAK_PASSWORD")
	case errors.Is(err, service.ErrAdminInvalidRole):
		helper.SendError(c, http.StatusBadRequest, "Invalid role value.", "ERR_INVALID_ROLE")
	case errors.Is(err, service.ErrAdminInvalidStatus):
		helper.SendError(c, http.StatusBadRequest, "Invalid status value.", "ERR_INVALID_STATUS")
	case errors.Is(err, service.ErrAdminEmailExists):
		helper.SendError(c, http.StatusConflict, "Email is already registered.", "ERR_EMAIL_EXISTS")
	case errors.Is(err, service.ErrAdminEmailInUse):
		helper.SendError(c, http.StatusConflict, "Email is already in use by another user.", "ERR_EMAIL_IN_USE")
	case errors.Is(err, service.ErrAdminCannotSuspendSelf):
		helper.SendError(c, http.StatusBadRequest, "You cannot suspend your own admin account.", "ERR_CANNOT_SUSPEND_SELF")
	case errors.Is(err, service.ErrAdminCannotDemoteSelf):
		helper.SendError(c, http.StatusBadRequest, "You cannot remove your own admin role.", "ERR_CANNOT_DEMOTE_SELF")
	case errors.Is(err, service.ErrAdminCannotDeleteSelf):
		helper.SendError(c, http.StatusBadRequest, "You cannot delete your own admin account.", "ERR_CANNOT_DELETE_SELF")
	case errors.Is(err, service.ErrAdminCreditAmountZero):
		helper.SendError(c, http.StatusBadRequest, "Credit amount cannot be zero.", "ERR_CREDIT_AMOUNT")
	case errors.Is(err, service.ErrAdminCreditPaidMismatch):
		helper.SendError(c, http.StatusBadRequest, "Amount paid cannot be associated with credit deduction.", "ERR_CREDIT_PAID")
	case errors.Is(err, service.ErrAdminInvalidAction):
		helper.SendError(c, http.StatusBadRequest, "Invalid action specified.", "ERR_INVALID_ACTION")
	case errors.Is(err, service.ErrAdminRequiredFields):
		helper.SendError(c, http.StatusBadRequest, "Name, email and password are required.", "ERR_REQUIRED_FIELDS")
	case errors.Is(err, service.ErrAdminNameEmailRequired):
		helper.SendError(c, http.StatusBadRequest, "Name and email are required.", "ERR_REQUIRED_FIELDS")
	default:
		helper.SendError(c, http.StatusInternalServerError, "Action failed. Please try again.", "ERR_ADMIN_USER_ACTION")
	}
}
