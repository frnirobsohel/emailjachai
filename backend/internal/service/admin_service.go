package service

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/safe"
	"ejp-backend/pkg/security"
)

type AdminService interface {
	GetAdminStats() (map[string]interface{}, error)
	GetAllUsers() ([]model.User, error)
	ListUsers(q, role string, page, limit int) (*AdminUserListResult, error)
	UserAction(action string, targetUserID uint, adminID uint, status, role string, amount int, amountPaid float64) error
	GetJobStats() (interface{}, error)
	CleanupJobs(days int) (int64, error)
	CreateUser(name, email, password, role string, credits int) error
	EditUser(id uint, name, email, role string) error
	AdminDownloadAllJobs(jobType string) (*sql.Rows, error)
}

type AdminUserDTO struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	Credits   int    `json:"credits"`
	CreatedAt string `json:"created_at"`
	Plan      string `json:"plan"`
	IsPaid    bool   `json:"is_paid"`
}

type AdminUserSummary struct {
	Total      int64 `json:"total"`
	Inactive   int64 `json:"inactive"`
	Suspended  int64 `json:"suspended"`
	Paid       int64 `json:"paid"`
}

type AdminUserListResult struct {
	Users   []AdminUserDTO   `json:"users"`
	Total   int64            `json:"total"`
	Page    int              `json:"page"`
	Limit   int              `json:"limit"`
	Summary AdminUserSummary `json:"summary"`
}

var (
	ErrAdminWeakPassword       = errors.New("password does not meet strength requirements")
	ErrAdminInvalidRole        = errors.New("invalid role value")
	ErrAdminInvalidStatus      = errors.New("invalid status value")
	ErrAdminEmailExists        = errors.New("email is already registered")
	ErrAdminEmailInUse         = errors.New("email is already in use by another user")
	ErrAdminCannotSuspendSelf  = errors.New("you cannot suspend your own admin account")
	ErrAdminCannotDemoteSelf   = errors.New("you cannot remove your own admin role")
	ErrAdminCannotDeleteSelf   = errors.New("you cannot delete your own admin account")
	ErrAdminCreditAmountZero   = errors.New("credit amount cannot be zero")
	ErrAdminCreditPaidMismatch = errors.New("amount paid cannot be associated with credit deduction")
	ErrAdminInvalidAction      = errors.New("invalid action specified")
	ErrAdminRequiredFields     = errors.New("name, email and password are required")
	ErrAdminNameEmailRequired  = errors.New("name and email are required")
)

type adminService struct {
	adminRepo    repo.AdminRepo
	userRepo     repo.UserRepo
	jobRepo      repo.JobRepository
	logRepo      repo.LogRepo
	txRepo       repo.TransactionRepo
	serverRepo   repo.ServerRepo
	emailService EmailService
}

func NewAdminService(
	adminRepo repo.AdminRepo,
	userRepo repo.UserRepo,
	jobRepo repo.JobRepository,
	logRepo repo.LogRepo,
	txRepo repo.TransactionRepo,
	serverRepo repo.ServerRepo,
	emailService EmailService,
) AdminService {
	return &adminService{
		adminRepo:    adminRepo,
		userRepo:     userRepo,
		jobRepo:      jobRepo,
		logRepo:      logRepo,
		txRepo:       txRepo,
		serverRepo:   serverRepo,
		emailService: emailService,
	}
}

func (s *adminService) GetAdminStats() (map[string]interface{}, error) {
	totalUsers, err := s.userRepo.CountUsers(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}
	activeJobs, err := s.jobRepo.CountAllActiveJobs()
	if err != nil {
		return nil, fmt.Errorf("count active jobs: %w", err)
	}
	totalCredits, err := s.txRepo.SumCreditsSold(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("sum credits sold: %w", err)
	}
	totalRevenue, err := s.txRepo.SumRevenue(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("sum revenue: %w", err)
	}
	emailsVerified, err := s.jobRepo.SumProcessedEmails()
	if err != nil {
		return nil, fmt.Errorf("sum emails verified: %w", err)
	}
	activeWorkers, err := s.serverRepo.CountOnlineEnabled()
	if err != nil {
		return nil, fmt.Errorf("count workers: %w", err)
	}

	now := time.Now()
	last30Days := now.AddDate(0, 0, -30)
	prev30Days := now.AddDate(0, 0, -60)

	newUsersLast30, err := s.userRepo.CountUsers(&last30Days, nil)
	if err != nil {
		return nil, fmt.Errorf("count users last 30d: %w", err)
	}
	newUsersPrev30, err := s.userRepo.CountUsers(&prev30Days, &last30Days)
	if err != nil {
		return nil, fmt.Errorf("count users prev 30d: %w", err)
	}

	usersTrend := "+0.0% MoM"
	usersStatus := "up"
	if newUsersPrev30 > 0 {
		pct := float64(newUsersLast30-newUsersPrev30) / float64(newUsersPrev30) * 100
		if pct >= 0 {
			usersTrend = fmt.Sprintf("+%.1f%% MoM", pct)
		} else {
			usersTrend = fmt.Sprintf("%.1f%% MoM", pct)
			usersStatus = "down"
		}
	} else if newUsersLast30 > 0 {
		usersTrend = fmt.Sprintf("+%d users last 30d", newUsersLast30)
	}

	creditsLast30, err := s.txRepo.SumCreditsSold(&last30Days, nil)
	if err != nil {
		return nil, fmt.Errorf("sum credits last 30d: %w", err)
	}
	creditsPrev30, err := s.txRepo.SumCreditsSold(&prev30Days, &last30Days)
	if err != nil {
		return nil, fmt.Errorf("sum credits prev 30d: %w", err)
	}

	creditsTrend := "+0.0% MoM"
	creditsStatus := "up"
	if creditsPrev30 > 0 {
		pct := float64(creditsLast30-creditsPrev30) / float64(creditsPrev30) * 100
		if pct >= 0 {
			creditsTrend = fmt.Sprintf("+%.1f%% MoM", pct)
		} else {
			creditsTrend = fmt.Sprintf("%.1f%% MoM", pct)
			creditsStatus = "down"
		}
	} else if creditsLast30 > 0 {
		creditsTrend = fmt.Sprintf("+%s credits last 30d", helper.FormatNumber(creditsLast30))
	}

	revLast30, err := s.txRepo.SumRevenue(&last30Days, nil)
	if err != nil {
		return nil, fmt.Errorf("sum revenue last 30d: %w", err)
	}
	revPrev30, err := s.txRepo.SumRevenue(&prev30Days, &last30Days)
	if err != nil {
		return nil, fmt.Errorf("sum revenue prev 30d: %w", err)
	}

	revTrend := "+0.0% MoM"
	revStatus := "up"
	if revPrev30 > 0 {
		pct := (revLast30 - revPrev30) / revPrev30 * 100
		if pct >= 0 {
			revTrend = fmt.Sprintf("+%.1f%% MoM", pct)
		} else {
			revTrend = fmt.Sprintf("%.1f%% MoM", pct)
			revStatus = "down"
		}
	} else if revLast30 > 0 {
		revTrend = fmt.Sprintf("+$%.2f last 30d", revLast30)
	}

	jobsTrend := "Idle"
	jobsStatus := "down"
	if activeJobs > 0 {
		jobsTrend = fmt.Sprintf("%d running", activeJobs)
		jobsStatus = "up"
	}

	healthLabel := "Healthy"
	healthStatus := "up"
	switch {
	case activeJobs > 0 && activeWorkers == 0:
		healthLabel = "Degraded — jobs queued, no online workers"
		healthStatus = "down"
	case activeWorkers == 0:
		healthLabel = "No online workers"
		healthStatus = "down"
	default:
		healthLabel = fmt.Sprintf("%d worker node(s) online", activeWorkers)
	}

	recentUsers := make([]map[string]interface{}, 0, 5)
	dbUsers, err := s.userRepo.GetRecentUsers(5)
	if err != nil {
		return nil, fmt.Errorf("recent users: %w", err)
	}
	for _, u := range dbUsers {
		plan := "Free"
		var lastPkg string
		_ = s.txRepo.DB().Model(&model.Transaction{}).
			Where("user_id = ? AND status = ? AND package <> '' AND package IS NOT NULL", u.ID, "completed").
			Order("id DESC").
			Limit(1).
			Pluck("package", &lastPkg)
		if strings.TrimSpace(lastPkg) != "" {
			plan = strings.TrimSpace(lastPkg)
		}
		name := strings.TrimSpace(u.Name)
		if name == "" {
			name = "User"
		}
		recentUsers = append(recentUsers, map[string]interface{}{
			"name":  name,
			"email": u.Email,
			"plan":  plan,
			"date":  u.CreatedAt.Format("2006-01-02"),
		})
	}

	recentLogs := make([]map[string]interface{}, 0, 5)
	dbLogs, _, err := s.logRepo.List(repo.LogListParams{Limit: 5})
	if err != nil {
		return nil, fmt.Errorf("recent logs: %w", err)
	}
	for _, l := range dbLogs {
		status := "success"
		lvl := strings.ToLower(l.Level)
		switch lvl {
		case "warn":
			status = "warning"
		case "error":
			status = "error"
		}

		recentLogs = append(recentLogs, map[string]interface{}{
			"id":     l.ID,
			"user":   l.Source,
			"event":  l.Message,
			"time":   l.CreatedAt.Format("2006-01-02 15:04"),
			"status": status,
		})
	}

	return map[string]interface{}{
		"total_users": map[string]interface{}{
			"value":  fmt.Sprintf("%d", totalUsers),
			"trend":  usersTrend,
			"status": usersStatus,
		},
		"active_jobs": map[string]interface{}{
			"value":  fmt.Sprintf("%d", activeJobs),
			"trend":  jobsTrend,
			"status": jobsStatus,
		},
		"total_credits": map[string]interface{}{
			"value":  helper.FormatNumber(totalCredits),
			"trend":  creditsTrend,
			"status": creditsStatus,
		},
		"total_revenue": map[string]interface{}{
			"value":  fmt.Sprintf("$%.2f", totalRevenue),
			"trend":  revTrend,
			"status": revStatus,
		},
		"emails_verified": map[string]interface{}{
			"value":  helper.FormatNumber(emailsVerified),
			"trend":  "Lifetime processed",
			"status": "up",
		},
		"active_workers": map[string]interface{}{
			"value":  fmt.Sprintf("%d", activeWorkers),
			"trend":  healthLabel,
			"status": healthStatus,
		},
		"system_health": map[string]interface{}{
			"value":  healthLabel,
			"trend":  healthLabel,
			"status": healthStatus,
		},
		"recent_users": recentUsers,
		"recent_logs":  recentLogs,
	}, nil
}

func (s *adminService) GetAllUsers() ([]model.User, error) {
	return s.userRepo.GetAll()
}

func (s *adminService) ListUsers(q, role string, page, limit int) (*AdminUserListResult, error) {
	users, total, err := s.userRepo.ListUsers(q, role, page, limit)
	if err != nil {
		return nil, err
	}
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}

	ids := make([]uint, 0, len(users))
	for _, u := range users {
		ids = append(ids, u.ID)
	}
	plans, _ := s.userRepo.LatestPackageByUserIDs(ids)
	paidSet, _ := s.userRepo.PaidUserIDSet(ids)

	dtos := make([]AdminUserDTO, 0, len(users))
	for _, u := range users {
		plan := "Free"
		if p := strings.TrimSpace(plans[u.ID]); p != "" {
			plan = p
		}
		name := strings.TrimSpace(u.Name)
		if name == "" {
			name = "User"
		}
		dtos = append(dtos, AdminUserDTO{
			ID:        u.ID,
			Name:      name,
			Email:     u.Email,
			Role:      u.Role,
			Status:    u.Status,
			Credits:   u.Credits,
			CreatedAt: u.CreatedAt.UTC().Format(time.RFC3339),
			Plan:      plan,
			IsPaid:    paidSet[u.ID],
		})
	}

	inactive, _ := s.userRepo.CountByStatus("Inactive")
	suspended, _ := s.userRepo.CountByStatus("Suspended")
	paid, _ := s.userRepo.CountPaidUsers()
	allTotal, _ := s.userRepo.CountUsers(nil, nil)

	return &AdminUserListResult{
		Users: dtos,
		Total: total,
		Page:  page,
		Limit: limit,
		Summary: AdminUserSummary{
			Total:     allTotal,
			Inactive:  inactive,
			Suspended: suspended,
			Paid:      paid,
		},
	}, nil
}

func (s *adminService) revokeUserAPIAccess(userID uint) {
	var keys []model.APIKey
	if err := config.DB.Where("user_id = ?", userID).Find(&keys).Error; err != nil {
		return
	}
	for _, k := range keys {
		_ = config.DB.Model(&model.APIKey{}).Where("id = ?", k.ID).Update("status", "revoked").Error
		config.ClearCachedAPIAuthByKeyID(k.ID)
	}
}

func (s *adminService) UserAction(action string, targetUserID uint, adminID uint, status, role string, amount int, amountPaid float64) error {
	user, err := s.userRepo.GetByID(targetUserID)
	if err != nil {
		return err
	}

	allowedRoles := map[string]bool{"admin": true, "manager": true, "reseller": true, "user": true, "demo": true}
	allowedStatuses := map[string]bool{"Active": true, "Suspended": true}

	switch action {
	case "toggle_status":
		if !allowedStatuses[status] {
			return ErrAdminInvalidStatus
		}
		if targetUserID == adminID && status == "Suspended" {
			return ErrAdminCannotSuspendSelf
		}
		if err := s.userRepo.Update(user, map[string]interface{}{"status": status}); err != nil {
			return err
		}
		if status == "Suspended" {
			s.revokeUserAPIAccess(targetUserID)
			go s.emailService.SendTemplateEmail(user.Email, "account_banned", map[string]string{
				"name": user.Name,
			})
		}
		s.logActivity("INFO", "Admin", fmt.Sprintf("Changed user #%d status to %s", targetUserID, status), adminID)
		config.ClearAdminCache()
		return nil

	case "update_role":
		if !allowedRoles[role] {
			return ErrAdminInvalidRole
		}
		if targetUserID == adminID && role != "admin" {
			return ErrAdminCannotDemoteSelf
		}
		if err := s.userRepo.Update(user, map[string]interface{}{"role": role}); err != nil {
			return err
		}
		s.logActivity("INFO", "Admin", fmt.Sprintf("Changed user #%d role to %s", targetUserID, role), adminID)
		config.ClearAdminCache()
		return nil

	case "delete":
		if targetUserID == adminID {
			return ErrAdminCannotDeleteSelf
		}
		s.revokeUserAPIAccess(targetUserID)
		if err := s.userRepo.Delete(targetUserID); err != nil {
			return err
		}
		s.logActivity("WARN", "Admin", fmt.Sprintf("Deleted user #%d", targetUserID), adminID)
		config.ClearAdminCache()
		return nil

	case "adjust_credits":
		if amount == 0 {
			return ErrAdminCreditAmountZero
		}
		if amountPaid > 0 && amount < 0 {
			return ErrAdminCreditPaidMismatch
		}

		desc := "Admin removed credits"
		if amount > 0 {
			desc = "Admin added credits"
		}

		err := s.userRepo.AdjustCredits(targetUserID, amount, amountPaid, desc)

		if err == nil {
			if amount > 0 {
				emailCopy := user.Email
				nameCopy := user.Name
				amountCopy := amount
				safe.Go(func() {
					s.emailService.SendTemplateEmail(emailCopy, "credit_assigned", map[string]string{
						"name":    nameCopy,
						"credits": fmt.Sprintf("%d", amountCopy),
					})
				})
			}
			s.logActivity("INFO", "Admin", fmt.Sprintf("Adjusted %d credits for user #%d", amount, targetUserID), adminID)

			targetUserIDCopy := targetUserID
			safe.Go(func() {
				if updatedUser, getErr := s.userRepo.GetByID(targetUserIDCopy); getErr == nil && updatedUser != nil {
					ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", map[string]interface{}{
						"credits": updatedUser.Credits,
					})
				}
				InvalidateAndRefreshDashboardStats(targetUserIDCopy)
			})
			config.ClearAdminCache()
		}
		return err
	}
	return ErrAdminInvalidAction
}

func (s *adminService) logActivity(level, source, message string, adminID uint) {
	log := &model.ActivityLog{
		UserID:  &adminID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	_ = s.logRepo.Create(log)
}

func (s *adminService) GetJobStats() (interface{}, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	sevenDaysAgo := now.AddDate(0, 0, -7)
	fourteenDaysAgo := now.AddDate(0, 0, -14)
	thirtyDaysAgo := now.AddDate(0, 0, -30)

	return s.adminRepo.GetJobStatsSummary(todayStart, sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo)
}

func (s *adminService) CleanupJobs(days int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days)
	n, err := s.adminRepo.CleanupJobsByDate(cutoff)
	if err == nil {
		config.ClearAdminCache()
	}
	return n, err
}

func (s *adminService) CreateUser(name, email, password, role string, credits int) error {
	if name == "" || email == "" || password == "" {
		return ErrAdminRequiredFields
	}

	allowedRoles := map[string]bool{"admin": true, "manager": true, "reseller": true, "user": true, "demo": true}
	if !allowedRoles[role] {
		return ErrAdminInvalidRole
	}

	if !security.IsStrongPassword(password) {
		return ErrAdminWeakPassword
	}

	existing, _ := s.userRepo.GetByEmail(email)
	if existing != nil {
		return ErrAdminEmailExists
	}

	hashedPassword, err := helper.HashPassword(password)
	if err != nil || hashedPassword == "" {
		return fmt.Errorf("failed to hash password")
	}

	user := &model.User{
		Name:     name,
		Email:    email,
		Password: hashedPassword,
		Role:     role,
		Credits:  credits,
		Status:   "Active",
	}

	if err := s.userRepo.Create(user); err != nil {
		return err
	}
	config.ClearAdminCache()
	return nil
}

func (s *adminService) EditUser(id uint, name, email, role string) error {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	if name == "" || email == "" {
		return ErrAdminNameEmailRequired
	}

	allowedRoles := map[string]bool{"admin": true, "manager": true, "reseller": true, "user": true, "demo": true}
	if !allowedRoles[role] {
		return ErrAdminInvalidRole
	}

	if email != user.Email {
		existing, _ := s.userRepo.GetByEmail(email)
		if existing != nil {
			return ErrAdminEmailInUse
		}
	}

	updates := map[string]interface{}{
		"name":  name,
		"email": email,
		"role":  role,
	}

	if err := s.userRepo.Update(user, updates); err != nil {
		return err
	}
	config.ClearAdminCache()
	return nil
}

func (s *adminService) AdminDownloadAllJobs(jobType string) (*sql.Rows, error) {
	return s.adminRepo.AdminDownloadAllJobs(jobType)
}
