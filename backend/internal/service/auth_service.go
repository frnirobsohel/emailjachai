package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"
)

type AuthService interface {
	Register(firstName, lastName, email, password string) (*model.User, string, error)
	Login(email, password, ip string) (*model.User, string, error)
	Impersonate(targetUserID uint, adminID uint) (*model.User, string, error)
	ForgotPassword(email string) error
	ResetPassword(email, code, newPassword string) error
	VerifyEmail(email, code string) error
	ResendVerification(email string) error
	ResendReset(email string) error
}

type authService struct {
	userRepo      repo.UserRepo
	apiKeyService APIKeyService
	logRepo       repo.LogRepo
	emailService  EmailService
	systemRepo    repo.SystemRepo
	settingsRepo  repo.SettingsRepo
}

func NewAuthService(userRepo repo.UserRepo, apiKeyService APIKeyService, logRepo repo.LogRepo, emailService EmailService, systemRepo repo.SystemRepo, settingsRepo repo.SettingsRepo) AuthService {
	return &authService{
		userRepo:      userRepo,
		apiKeyService: apiKeyService,
		logRepo:       logRepo,
		emailService:  emailService,
		systemRepo:    systemRepo,
		settingsRepo:  settingsRepo,
	}
}

func (s *authService) Register(firstName, lastName, email, password string) (*model.User, string, error) {
	firstName = strings.TrimSpace(firstName)
	lastName = strings.TrimSpace(lastName)
	email = strings.ToLower(strings.TrimSpace(email))

	existingUser, _ := s.userRepo.GetByEmail(email)
	if existingUser != nil {
		return nil, "", errors.New("user already exists")
	}

	hashedPassword, err := helper.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	smtpConfig, errSmtp := s.systemRepo.GetSmtpSettings()
	if errSmtp != nil {
		smtpConfig = &model.SmtpConfig{}
	}

	status := "Active"
	if smtpConfig.IsActive {
		status = "Inactive"
	}

	defaultCredits := 100
	var setting model.Setting
	if errSetting := s.settingsRepo.DB().Where("setting_key = 'registration_credits' OR setting_key = 'default_credits'").Order("setting_key DESC").First(&setting).Error; errSetting == nil {
		if val, convErr := helper.SafeAtoi(setting.SettingValue); convErr == nil && val >= 0 {
			defaultCredits = val
		}
	}

	user := &model.User{
		Name:     firstName + " " + lastName,
		Email:    email,
		Password: hashedPassword,
		Credits:  defaultCredits,
		Role:     "user",
		Status:   status,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, "", err
	}

	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	isActive := smtpConfig.IsActive
	userName := user.Name
	emailAddr := user.Email
	safe.Go(func() {
		placeholders := map[string]string{
			"name": userName,
		}
		if isActive {
			code, issueErr := helper.IssueOTP(helper.OTPVerify, emailAddr)
			if issueErr != nil {
				logger.Warn("Failed to issue verification OTP", "email", emailAddr, "error", issueErr)
				return
			}
			placeholders["verification_code"] = code
		}
		s.emailService.SendTemplateEmail(emailAddr, "register", placeholders)
	})

	return user, apiKey, nil
}

func (s *authService) Login(email, password, ip string) (*model.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	ip = strings.TrimSpace(ip)

	fifteenMinutesAgo := time.Now().Add(-15 * time.Minute)
	failedCount, _ := s.logRepo.CountFailedLogins(ip, email, fifteenMinutesAgo)

	if failedCount >= 10 {
		return nil, "", errors.New("too many failed login attempts. Please try again in 15 minutes")
	}

	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		s.logRepo.Create(&model.ActivityLog{
			Level:      "WARN",
			Source:     "Auth",
			Event:      "Login Failed",
			Message:    fmt.Sprintf("Invalid email or password attempt for: %s", email),
			IP:         ip,
			Identifier: email,
		})
		return nil, "", errors.New("invalid email or password")
	}

	if !helper.CheckPasswordHash(password, user.Password) {
		s.logRepo.Create(&model.ActivityLog{
			UserID:     &user.ID,
			Level:      "WARN",
			Source:     "Auth",
			Event:      "Login Failed",
			Message:    fmt.Sprintf("Invalid password for user: %s", email),
			IP:         ip,
			Identifier: email,
		})
		return nil, "", errors.New("invalid email or password")
	}

	if strings.EqualFold(user.Status, "suspended") {
		return nil, "", errors.New("account suspended")
	}
	if strings.EqualFold(user.Status, "inactive") {
		return nil, "", errors.New("please verify your email address to log in")
	}

	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	s.logRepo.Create(&model.ActivityLog{
		UserID:     &user.ID,
		Level:      "INFO",
		Source:     "Auth",
		Event:      "Login Success",
		Message:    fmt.Sprintf("User logged in: %s", email),
		IP:         ip,
		Identifier: email,
	})

	return user, apiKey, nil
}

func (s *authService) Impersonate(targetUserID uint, adminID uint) (*model.User, string, error) {
	if targetUserID == adminID {
		return nil, "", errors.New("cannot impersonate yourself")
	}

	user, err := s.userRepo.GetByID(targetUserID)
	if err != nil {
		return nil, "", err
	}

	if strings.EqualFold(user.Role, "admin") {
		return nil, "", errors.New("cannot impersonate another admin")
	}

	status := strings.ToLower(strings.TrimSpace(user.Status))
	if status == "suspended" || status == "inactive" {
		return nil, "", errors.New("cannot impersonate a suspended or inactive account")
	}

	apiKey, err := s.apiKeyService.CreateImpersonationKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	s.logRepo.Create(&model.ActivityLog{
		UserID:  &adminID,
		Level:   "WARN",
		Source:  "Admin",
		Message: fmt.Sprintf("Admin impersonated user #%d (%s)", user.ID, user.Email),
	})

	return user, apiKey, nil
}

func (s *authService) ForgotPassword(email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		return nil
	}

	if err := helper.CheckOTPResendCooldown(helper.OTPReset, email); err != nil {
		// Still return nil to avoid enumeration; cooldown is enforced on resend too.
		if errors.Is(err, helper.ErrOTPResendCooldownErr) {
			return nil
		}
	}

	code, err := helper.IssueOTP(helper.OTPReset, email)
	if err != nil {
		logger.Warn("Failed to issue reset OTP", "email", email, "error", err)
		return nil
	}

	userName := user.Name
	userEmail := user.Email
	safe.Go(func() {
		s.emailService.SendTemplateEmail(userEmail, "forgot", map[string]string{
			"name":       userName,
			"reset_code": code,
		})
	})

	return nil
}

func (s *authService) ResetPassword(email, code, newPassword string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		return helper.ErrOTPInvalid
	}

	hashedPassword, err := helper.HashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := helper.VerifyOTP(helper.OTPReset, email, code); err != nil {
		return err
	}

	user.Password = hashedPassword
	if err := s.userRepo.Update(user, map[string]interface{}{"password": hashedPassword}); err != nil {
		return err
	}

	return nil
}

func (s *authService) VerifyEmail(email, code string) error {
	email = strings.ToLower(strings.TrimSpace(email))

	user, err := s.userRepo.GetByEmail(email)
	if err != nil || user == nil {
		return helper.ErrOTPInvalid
	}

	if strings.EqualFold(user.Status, "active") {
		return nil
	}

	if err := helper.VerifyOTP(helper.OTPVerify, email, code); err != nil {
		return err
	}

	user.Status = "Active"
	if updateErr := s.userRepo.Update(user, map[string]interface{}{"status": "Active"}); updateErr != nil {
		return errors.New("failed to verify email")
	}

	return nil
}

func (s *authService) ResendVerification(email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	user, err := s.userRepo.GetByEmail(email)
	if err != nil || user == nil {
		return nil
	}

	if strings.EqualFold(user.Status, "active") {
		return nil
	}

	if err := helper.CheckOTPResendCooldown(helper.OTPVerify, email); err != nil {
		return err
	}

	code, err := helper.IssueOTP(helper.OTPVerify, email)
	if err != nil {
		return err
	}

	userName := user.Name
	userEmail := user.Email
	safe.Go(func() {
		s.emailService.SendTemplateEmail(userEmail, "register", map[string]string{
			"name":              userName,
			"verification_code": code,
		})
	})

	return nil
}

func (s *authService) ResendReset(email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	user, err := s.userRepo.GetByEmail(email)
	if err != nil || user == nil {
		return nil
	}

	if err := helper.CheckOTPResendCooldown(helper.OTPReset, email); err != nil {
		return err
	}

	code, err := helper.IssueOTP(helper.OTPReset, email)
	if err != nil {
		return err
	}

	userName := user.Name
	userEmail := user.Email
	safe.Go(func() {
		s.emailService.SendTemplateEmail(userEmail, "forgot", map[string]string{
			"name":       userName,
			"reset_code": code,
		})
	})

	return nil
}
