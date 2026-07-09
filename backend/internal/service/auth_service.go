package service

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
	"ejp-backend/pkg/safe"

	"github.com/golang-jwt/jwt/v5"
)

type AuthService interface {
	Register(firstName, lastName, email, password string) (*model.User, string, error)
	Login(email, password, ip string) (*model.User, string, error)
	Impersonate(targetUserID uint, adminID uint) (*model.User, string, error)
	ForgotPassword(email string) error
	ResetPassword(token, newPassword string) error
	VerifyEmail(token string) error
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

	// 1. Check if email exists
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

	// 3. Create User
	user := &model.User{
		Name:     firstName + " " + lastName,
		Email:    email,
		Password: hashedPassword,
		Credits:  defaultCredits, // Default signup credits from settings
		Role:     "user",
		Status:   status,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, "", err
	}

	// 4. Create Default API Key
	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	// Send Registration Email asynchronously
	isActive := smtpConfig.IsActive
	userEmail := user.Name
	emailAddr := user.Email
	safe.Go(func() {
		frontendURL := os.Getenv("FRONTEND_URL")
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}
		apiUrl := os.Getenv("API_URL")
		if apiUrl == "" {
			apiUrl = "http://localhost:8000"
		}

		verificationLink := fmt.Sprintf("%s/login", frontendURL)
		if isActive {
			token, _ := helper.GenerateVerificationToken(emailAddr)
			verificationLink = fmt.Sprintf("%s/api/v1/auth/verify-email?token=%s", apiUrl, token)
		}

		placeholders := map[string]string{
			"name":              userEmail,
			"verification_link": verificationLink,
		}
		s.emailService.SendTemplateEmail(emailAddr, "register", placeholders)
	})

	return user, apiKey, nil
}

func (s *authService) Login(email, password, ip string) (*model.User, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	ip = strings.TrimSpace(ip)

	// 1. Throttle check (limit to 10 failures / 15 minutes)
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

	// Rotate or Create Login Key
	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	// Log success
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
	user, err := s.userRepo.GetByID(targetUserID)
	if err != nil {
		return nil, "", err
	}

	apiKey, err := s.apiKeyService.CreateImpersonationKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	// Log activity (Legacy parity: WARN level for impersonation)
	s.logRepo.Create(&model.ActivityLog{
		UserID:  &adminID,
		Level:   "WARN",
		Source:  "Admin",
		Message: fmt.Sprintf("Admin impersonated user #%d (%s)", user.ID, user.Email),
	})

	return user, apiKey, nil
}

func (s *authService) ForgotPassword(email string) error {
	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		// Do not leak existence
		return nil
	}

	token, err := helper.GenerateResetToken(user.Email, user.Password)
	if err != nil {
		return err
	}

	// Send Forgot Password Email asynchronously
	safe.Go(func() {
		frontendURL := os.Getenv("FRONTEND_URL")
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}
		placeholders := map[string]string{
			"name":       user.Name,
			"reset_link": fmt.Sprintf("%s/reset-password?token=%s", frontendURL, token),
		}
		s.emailService.SendTemplateEmail(user.Email, "forgot", placeholders)
	})

	return nil
}

func (s *authService) ResetPassword(tokenString, newPassword string) error {
	// 1. Decode token without validation to extract email claim
	var claims jwt.MapClaims
	_, _, err := new(jwt.Parser).ParseUnverified(tokenString, &claims)
	if err != nil {
		return errors.New("invalid or expired reset token")
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "reset" {
		return errors.New("invalid or expired reset token")
	}

	email, ok := claims["email"].(string)
	if !ok || email == "" {
		return errors.New("invalid or expired reset token")
	}

	// 2. Fetch user to obtain current password hash
	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		return errors.New("user not found")
	}

	// 3. Fully verify token using user's password hash
	_, err = helper.VerifyResetToken(tokenString, user.Password)
	if err != nil {
		return errors.New("invalid or expired reset token")
	}

	hashedPassword, err := helper.HashPassword(newPassword)
	if err != nil {
		return err
	}

	user.Password = hashedPassword
	if err := s.userRepo.Update(user, map[string]interface{}{"password": hashedPassword}); err != nil {
		return err
	}

	return nil
}

func (s *authService) VerifyEmail(token string) error {
	email, err := helper.VerifyVerificationToken(token)
	if err != nil {
		return errors.New("invalid or expired verification token")
	}

	user, err := s.userRepo.GetByEmail(email)
	if err != nil || user == nil {
		return errors.New("user not found")
	}

	if strings.EqualFold(user.Status, "active") {
		return nil // Already verified
	}

	user.Status = "Active"
	if updateErr := s.userRepo.Update(user, map[string]interface{}{"status": "Active"}); updateErr != nil {
		return errors.New("failed to verify email")
	}

	return nil
}
