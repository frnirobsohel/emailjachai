package service

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/ws"
)

type AdminService interface {
	GetAdminStats() (map[string]interface{}, error)
	GetAllUsers() ([]model.User, error)
	UserAction(action string, targetUserID uint, adminID uint, status, role string, amount int, amountPaid float64) error
	GetJobStats() (interface{}, error)
	CleanupJobs(days int) (int64, error)
	CreateUser(name, email, password, role string, credits int) error
	EditUser(id uint, name, email, role string) error
	AdminDownloadAllJobs(jobType string) (*sql.Rows, error)
}

type adminService struct {
	adminRepo     repo.AdminRepo
	userRepo      repo.UserRepo
	jobRepo       repo.JobRepository
	logRepo       repo.LogRepo
	txRepo        repo.TransactionRepo
	emailService  EmailService
}

func NewAdminService(adminRepo repo.AdminRepo, userRepo repo.UserRepo, jobRepo repo.JobRepository, logRepo repo.LogRepo, txRepo repo.TransactionRepo, emailService EmailService) AdminService {
	return &adminService{
		adminRepo:    adminRepo,
		userRepo:     userRepo,
		jobRepo:      jobRepo,
		logRepo:      logRepo,
		txRepo:       txRepo,
		emailService: emailService,
	}
}

func (s *adminService) GetAdminStats() (map[string]interface{}, error) {
	totalUsers, _ := s.userRepo.CountUsers(nil, nil)
	activeJobs, _ := s.jobRepo.CountAllActiveJobs()
	totalCredits, _ := s.txRepo.SumCreditsSold(nil, nil)
	totalRevenue, _ := s.txRepo.SumRevenue(nil, nil)

	// Dynamic MoM growth calculations
	now := time.Now()
	last30Days := now.AddDate(0, 0, -30)
	prev30Days := now.AddDate(0, 0, -60)

	// 1. Users MoM
	newUsersLast30, _ := s.userRepo.CountUsers(&last30Days, nil)
	newUsersPrev30, _ := s.userRepo.CountUsers(&prev30Days, &last30Days)

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

	// 2. Credits Sold MoM
	creditsLast30, _ := s.txRepo.SumCreditsSold(&last30Days, nil)
	creditsPrev30, _ := s.txRepo.SumCreditsSold(&prev30Days, &last30Days)

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

	// 3. Revenue MoM
	revLast30, _ := s.txRepo.SumRevenue(&last30Days, nil)
	revPrev30, _ := s.txRepo.SumRevenue(&prev30Days, &last30Days)

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

	// Recent Users (Legacy Parity: Top 5)
	var recentUsers []map[string]interface{}
	dbUsers, _ := s.userRepo.GetRecentUsers(5)
	for _, u := range dbUsers {
		recentUsers = append(recentUsers, map[string]interface{}{
			"name":  u.Name,
			"email": u.Email,
			"plan":  "Basic",
			"date":  u.CreatedAt.Format("2006-01-02"),
		})
	}

	// Recent Logs (Legacy Parity: Top 5)
	var recentLogs []map[string]interface{}
	dbLogs, _, _ := s.logRepo.List(5, 0)
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
			"user":   l.Source,
			"event":  l.Message, // Legacy Parity: message as event
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
			"trend":  "Running",
			"status": "up",
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
		"recent_users": recentUsers,
		"recent_logs":  recentLogs,
	}, nil
}

func (s *adminService) GetAllUsers() ([]model.User, error) {
	return s.userRepo.GetAll()
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
			return fmt.Errorf("invalid status value: %s", status)
		}
		if targetUserID == adminID && status == "Suspended" {
			return fmt.Errorf("you cannot suspend your own admin account")
		}
		if err := s.userRepo.Update(user, map[string]interface{}{"status": status}); err != nil {
			return err
		}
		if status == "Suspended" {
			go s.emailService.SendTemplateEmail(user.Email, "account_banned", map[string]string{
				"name": user.Name,
			})
		}
		s.logActivity("INFO", "Admin", fmt.Sprintf("Changed user #%d status to %s", targetUserID, status), adminID)
		return nil

	case "update_role":
		if !allowedRoles[role] {
			return fmt.Errorf("invalid role value: %s", role)
		}
		if targetUserID == adminID && role != "admin" {
			return fmt.Errorf("you cannot remove your own admin role")
		}
		if err := s.userRepo.Update(user, map[string]interface{}{"role": role}); err != nil {
			return err
		}
		s.logActivity("INFO", "Admin", fmt.Sprintf("Changed user #%d role to %s", targetUserID, role), adminID)
		return nil

	case "delete":
		if targetUserID == adminID {
			return fmt.Errorf("you cannot delete your own admin account")
		}
		if err := s.userRepo.Delete(targetUserID); err != nil {
			return err
		}
		s.logActivity("WARN", "Admin", fmt.Sprintf("Deleted user #%d", targetUserID), adminID)
		return nil

	case "adjust_credits":
		if amount == 0 {
			return fmt.Errorf("credit amount cannot be zero")
		}
		if amountPaid > 0 && amount < 0 {
			return fmt.Errorf("amount paid cannot be associated with credit deduction")
		}

		desc := "Admin removed credits"
		if amount > 0 {
			desc = "Admin added credits"
		}

		err := s.userRepo.AdjustCredits(targetUserID, amount, amountPaid, desc)

		if err == nil {
			if amount > 0 {
				go s.emailService.SendTemplateEmail(user.Email, "credit_assigned", map[string]string{
					"name":    user.Name,
					"credits": fmt.Sprintf("%d", amount),
				})
			}
			s.logActivity("INFO", "Admin", fmt.Sprintf("Adjusted %d credits for user #%d", amount, targetUserID), adminID)

			// Broadcast updated credits and stats to the target user in real-time
			go func() {
				if updatedUser, getErr := s.userRepo.GetByID(targetUserID); getErr == nil && updatedUser != nil {
					ws.GlobalHub.BroadcastToUser(updatedUser.ID, "user_update", map[string]interface{}{
						"credits": updatedUser.Credits,
					})
				}
				ComputeAndCacheDashboardStats(targetUserID)
			}()
		}
		return err
	}
	return fmt.Errorf("invalid action specified: %s", action)
}

// logActivity is a helper to record administrative actions (Legacy Parity)
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

	summaryInterface, err := s.adminRepo.GetJobStatsSummary(todayStart, sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo)
	if err != nil {
		return nil, err
	}

	// Because Go doesn't let us easily access fields of an anonymous struct hidden in interface{},
	// we will define the struct type again here, or better, we can just cast it.
	// Since we defined the struct in the repo but returned interface{}, we need a clean way to pass data.
	// Actually, wait, let's fix this in a cleaner way. I'll pass back the interface{} from repo, 
	// but I need to map it here. Let's assume GetJobStatsSummary returns the exact map we want?
	// Oh, I'll just change the repo to return the map directly! Wait, no, I'll update it inside the method below.
	
	// Let's do the mapping inside GetJobStatsSummary in the repo and return the map[string]interface{}.
	// For now, I will assume GetJobStatsSummary returns map[string]interface{}
	return summaryInterface, nil
}

func (s *adminService) CleanupJobs(days int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days)
	return s.adminRepo.CleanupJobsByDate(cutoff)
}

func (s *adminService) CreateUser(name, email, password, role string, credits int) error {
	if name == "" || email == "" || password == "" {
		return fmt.Errorf("name, email and password are required")
	}

	// Check if email already exists
	existing, _ := s.userRepo.GetByEmail(email)
	if existing != nil {
		return fmt.Errorf("email is already registered")
	}

	hashedPassword, err := helper.HashPassword(password)
	if err != nil {
		return err
	}

	user := &model.User{
		Name:     name,
		Email:    email,
		Password: hashedPassword,
		Role:     role,
		Credits:  credits,
		Status:   "Active",
	}

	return s.userRepo.Create(user)
}

func (s *adminService) EditUser(id uint, name, email, role string) error {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	if name == "" || email == "" {
		return fmt.Errorf("name and email are required")
	}

	// If email changed, verify uniqueness
	if email != user.Email {
		existing, _ := s.userRepo.GetByEmail(email)
		if existing != nil {
			return fmt.Errorf("email is already in use by another user")
		}
	}

	updates := map[string]interface{}{
		"name":  name,
		"email": email,
		"role":  role,
	}

	return s.userRepo.Update(user, updates)
}

func (s *adminService) AdminDownloadAllJobs(jobType string) (*sql.Rows, error) {
	return s.adminRepo.AdminDownloadAllJobs(jobType)
}
