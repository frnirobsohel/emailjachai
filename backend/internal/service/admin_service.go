package service

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type AdminService interface {
	GetAdminStats() (map[string]interface{}, error)
	GetAllUsers() ([]model.User, error)
	UserAction(action string, targetUserID uint, adminID uint, status, role string, amount int, amountPaid float64) error
	GetJobStats() (interface{}, error)
	CleanupJobs(days int) (int64, error)
	GetWorkerKey() (string, error)
	RotateWorkerKey() (string, error)
	CreateUser(name, email, password, role string, credits int) error
	EditUser(id uint, name, email, role string) error
	AdminDownloadAllJobs(jobType string) (*sql.Rows, error)
}

type adminService struct {
	userRepo      repo.UserRepo
	jobRepo       repo.JobRepository
	logRepo       repo.LogRepo
	emailService  EmailService
}

func NewAdminService(userRepo repo.UserRepo, jobRepo repo.JobRepository, logRepo repo.LogRepo, emailService EmailService) AdminService {
	return &adminService{
		userRepo:     userRepo,
		jobRepo:      jobRepo,
		logRepo:      logRepo,
		emailService: emailService,
	}
}

func (s *adminService) GetAdminStats() (map[string]interface{}, error) {
	var totalUsers int64
	var activeJobs int64
	var totalCredits int64
	var totalRevenue float64

	config.DB.Model(&model.User{}).Count(&totalUsers)
	config.DB.Model(&model.Job{}).Where("status IN ?", []string{"pending", "processing"}).Count(&activeJobs)

	// Sum total credits sold (Parity with Legacy: sum from successful transactions)
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ?", "purchase", "completed").
		Select("COALESCE(SUM(credits_added), 0)").Row().Scan(&totalCredits)

	// Sum revenue from successful transactions (purchases)
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ?", "purchase", "completed").
		Select("COALESCE(SUM(amount), 0)").Row().Scan(&totalRevenue)

	// Dynamic MoM growth calculations
	now := time.Now()
	last30Days := now.AddDate(0, 0, -30)
	prev30Days := now.AddDate(0, 0, -60)

	// 1. Users MoM
	var newUsersLast30 int64
	var newUsersPrev30 int64
	config.DB.Model(&model.User{}).Where("created_at >= ?", last30Days).Count(&newUsersLast30)
	config.DB.Model(&model.User{}).Where("created_at >= ? AND created_at < ?", prev30Days, last30Days).Count(&newUsersPrev30)

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
	var creditsLast30 int64
	var creditsPrev30 int64
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ? AND created_at >= ?", "purchase", "completed", last30Days).
		Select("COALESCE(SUM(credits_added), 0)").Row().Scan(&creditsLast30)
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ? AND created_at >= ? AND created_at < ?", "purchase", "completed", prev30Days, last30Days).
		Select("COALESCE(SUM(credits_added), 0)").Row().Scan(&creditsPrev30)

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
	var revLast30 float64
	var revPrev30 float64
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ? AND created_at >= ?", "purchase", "completed", last30Days).
		Select("COALESCE(SUM(amount), 0)").Row().Scan(&revLast30)
	config.DB.Model(&model.Transaction{}).
		Where("type = ? AND status = ? AND created_at >= ? AND created_at < ?", "purchase", "completed", prev30Days, last30Days).
		Select("COALESCE(SUM(amount), 0)").Row().Scan(&revPrev30)

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
	var dbUsers []model.User
	config.DB.Order("id DESC").Limit(5).Find(&dbUsers)
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
	var dbLogs []model.ActivityLog
	config.DB.Order("created_at DESC").Limit(5).Find(&dbLogs)
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

		err := config.DB.Transaction(func(tx *gorm.DB) error {
			newCredits := user.Credits + amount
			if newCredits < 0 {
				newCredits = 0
			}

			if err := tx.Model(user).Update("credits", newCredits).Error; err != nil {
				return err
			}

			txnType := "adjustment"
			desc := "Admin removed credits"
			if amount > 0 {
				desc = "Admin added credits"
			}

			txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
			transaction := &model.Transaction{
				UserID:        targetUserID,
				TransactionID: txnID,
				Amount:        amountPaid,
				CreditsAdded:  amount,
				Type:          txnType,
				Status:        "completed",
				Description:   desc,
				Provider:      "system",
			}
			return tx.Create(transaction).Error
		})

		if err == nil {
			if amount > 0 {
				go s.emailService.SendTemplateEmail(user.Email, "credit_assigned", map[string]string{
					"name":    user.Name,
					"credits": fmt.Sprintf("%d", amount),
				})
			}
			s.logActivity("INFO", "Admin", fmt.Sprintf("Adjusted %d credits for user #%d", amount, targetUserID), adminID)
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

	var summary struct {
		TotalJobs       int64 `gorm:"column:total_jobs"`
		TotalEmails     int64 `gorm:"column:total_emails"`
		ProcessedEmails int64 `gorm:"column:processed_emails"`
		JobsToday       int64 `gorm:"column:jobs_today"`
		ProcessedToday  int64 `gorm:"column:processed_today"`
		Jobs7d          int64 `gorm:"column:jobs_7d"`
		Processed7d     int64 `gorm:"column:processed_7d"`
		Jobs14d         int64 `gorm:"column:jobs_14d"`
		Processed14d    int64 `gorm:"column:processed_14d"`
		Jobs30d         int64 `gorm:"column:jobs_30d"`
		Processed30d    int64 `gorm:"column:processed_30d"`
		Valid           int64 `gorm:"column:valid"`
		Unknown         int64 `gorm:"column:unknown"`
		Invalid         int64 `gorm:"column:invalid"`
		CatchAll        int64 `gorm:"column:catch_all"`
		Disposable      int64 `gorm:"column:disposable"`
	}

	if err := config.DB.Model(&model.Job{}).Select(`
		COUNT(*) as total_jobs,
		COALESCE(SUM(total_emails), 0) as total_emails,
		COALESCE(SUM(processed_count), 0) as processed_emails,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_today,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_today,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_7d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_7d,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_14d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_14d,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_30d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_30d,
		COALESCE(SUM(deliverable), 0) as valid,
		COALESCE(SUM(risky), 0) as unknown,
		COALESCE(SUM(undeliverable), 0) as invalid,
		COALESCE(SUM(catch_all), 0) as catch_all,
		COALESCE(SUM(disposable), 0) as disposable
	`,
		todayStart, todayStart,
		sevenDaysAgo, sevenDaysAgo,
		fourteenDaysAgo, fourteenDaysAgo,
		thirtyDaysAgo, thirtyDaysAgo,
	).Scan(&summary).Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"overview": map[string]interface{}{
			"total_jobs":       summary.TotalJobs,
			"total_emails":     summary.TotalEmails,
			"processed_emails": summary.ProcessedEmails,
			"jobs_today":       summary.JobsToday,
			"processed_today":  summary.ProcessedToday,
			"jobs_7d":          summary.Jobs7d,
			"processed_7d":     summary.Processed7d,
			"jobs_14d":         summary.Jobs14d,
			"processed_14d":    summary.Processed14d,
			"jobs_30d":         summary.Jobs30d,
			"processed_30d":    summary.Processed30d,
		},
		"breakdown": map[string]interface{}{
			"valid":      summary.Valid,
			"unknown":    summary.Unknown,
			"invalid":    summary.Invalid,
			"catch_all":  summary.CatchAll,
			"disposable": summary.Disposable,
		},
	}, nil
}

func (s *adminService) CleanupJobs(days int) (int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days)

	var jobIDs []string
	config.DB.Model(&model.Job{}).Where("created_at < ?", cutoff).Pluck("job_id", &jobIDs)

	if len(jobIDs) == 0 {
		return 0, nil
	}

	var deletedCount int64
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var internalIDs []uint
		tx.Model(&model.Job{}).Where("job_id IN ?", jobIDs).Pluck("id", &internalIDs)
		if len(internalIDs) > 0 {
			tx.Where("job_internal_id IN ?", internalIDs).Delete(&model.JobResult{})
		}
		tx.Where("job_id IN ?", jobIDs).Delete(&model.JobTask{})
		res := tx.Where("job_id IN ?", jobIDs).Delete(&model.Job{})
		deletedCount = res.RowsAffected
		return res.Error
	})

	return deletedCount, err
}

func (s *adminService) GetWorkerKey() (string, error) {
	return "worker_key_xyz", nil
}

func (s *adminService) RotateWorkerKey() (string, error) {
	return "new_worker_key_abc", nil
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
	query := config.DB.Model(&model.JobResult{}).
		Joins("JOIN jobs ON jobs.id = job_results.job_internal_id").
		Select("job_results.email, job_results.status, job_results.reason, job_results.is_catch_all, job_results.score, job_results.created_at, jobs.job_id as legacy_job_id")

	switch jobType {
	case "single":
		query = query.Where("jobs.job_type = ?", "single")
	case "bulk":
		query = query.Where("jobs.job_type = ?", "bulk")
	}

	return query.Order("job_results.created_at DESC").Rows()
}
