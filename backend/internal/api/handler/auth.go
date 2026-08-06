package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/api/presenter"
	"ejp-backend/internal/api/request"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService service.AuthService
	userService service.UserService
}

func NewAuthHandler(authService service.AuthService, userService service.UserService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		userService: userService,
	}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var input request.RegisterRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "not_disposable") {
			helper.SendError(c, http.StatusBadRequest, "Disposable or temporary email addresses are not allowed.", "ERR_DISPOSABLE_EMAIL")
			return
		}
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	user, apiKey, err := h.authService.Register(input.FirstName, input.LastName, input.Email, input.Password)
	if err != nil {
		if err.Error() == "user already exists" {
			helper.SendError(c, http.StatusConflict, err.Error(), "ERR_USER_EXISTS")
		} else {
			helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		}
		return
	}

	helper.SendSuccess(c, "Registration successful", presenter.AuthResponse{
		APIKey: apiKey,
		User: presenter.UserResponse{
			ID:      user.ID,
			Name:    user.Name,
			Email:   user.Email,
			Credits: user.Credits,
			Role:    user.Role,
			Status:  user.Status,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var input request.LoginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	user, apiKey, err := h.authService.Login(input.Email, input.Password, c.ClientIP())
	if err != nil {
		helper.SendError(c, http.StatusUnauthorized, err.Error(), "ERR_INVALID_AUTH")
		return
	}

	helper.SendSuccess(c, "Login successful", presenter.AuthResponse{
		APIKey: apiKey,
		User: presenter.UserResponse{
			ID:      user.ID,
			Name:    user.Name,
			Email:   user.Email,
			Credits: user.Credits,
			Role:    user.Role,
			Status:  user.Status,
		},
	})
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	userID, _ := c.Get("userID")

	user, err := h.userService.GetByID(userID.(uint))
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "User not found", "ERR_USER_NOT_FOUND")
		return
	}

	helper.SendSuccess(c, "User profile retrieved", presenter.UserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Credits:   user.Credits,
		Role:      user.Role,
		Status:    user.Status,
		CreatedAt: user.CreatedAt.UTC().Format(time.RFC3339),
	})
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input request.UpdateProfileRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request. If changing password, use at least 8 characters with upper, lower, and a number.", "ERR_INVALID_REQUEST")
		return
	}

	newPass := input.NewPassword
	if newPass == "" {
		newPass = input.Password
	}

	err := h.userService.UpdateProfile(userID.(uint), input.Name, input.CurrentPassword, newPass)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrCurrentPasswordRequired):
			helper.SendError(c, http.StatusBadRequest, "Current password is required.", "ERR_CURRENT_PASSWORD_REQUIRED")
		case errors.Is(err, service.ErrCurrentPasswordIncorrect):
			helper.SendError(c, http.StatusUnauthorized, "Current password is incorrect.", "ERR_CURRENT_PASSWORD")
		case errors.Is(err, service.ErrWeakPassword):
			helper.SendError(c, http.StatusBadRequest, "Password must be at least 8 characters and include upper, lower, and a number.", "ERR_WEAK_PASSWORD")
		case errors.Is(err, service.ErrNoProfileUpdates):
			helper.SendError(c, http.StatusBadRequest, "No updates provided.", "ERR_NO_UPDATES")
		case errors.Is(err, service.ErrPasswordHashFailed):
			helper.SendError(c, http.StatusInternalServerError, "Failed to update password.", "ERR_PASSWORD_HASH")
		default:
			helper.SendError(c, http.StatusInternalServerError, "Failed to update profile.", "ERR_PROFILE_UPDATE")
		}
		return
	}

	helper.SendSuccess(c, "Profile updated successfully", nil)
}

func (h *AuthHandler) Impersonate(c *gin.Context) {
	var input struct {
		UserID uint `json:"user_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "User ID is required.", "ERR_INVALID_REQUEST")
		return
	}

	adminID, _ := c.Get("userID")
	user, apiKey, err := h.authService.Impersonate(input.UserID, adminID.(uint))
	if err != nil {
		errStr := err.Error()
		switch {
		case strings.Contains(errStr, "yourself"):
			helper.SendError(c, http.StatusBadRequest, "You cannot impersonate yourself.", "ERR_IMPERSONATE_SELF")
		case strings.Contains(errStr, "another admin"):
			helper.SendError(c, http.StatusForbidden, "You cannot impersonate another admin.", "ERR_IMPERSONATE_ADMIN")
		case strings.Contains(errStr, "suspended") || strings.Contains(errStr, "inactive"):
			helper.SendError(c, http.StatusBadRequest, "Cannot impersonate a suspended or inactive account.", "ERR_IMPERSONATE_STATUS")
		default:
			helper.SendError(c, http.StatusNotFound, "Target user not found.", "ERR_USER_NOT_FOUND")
		}
		return
	}

	helper.SendSuccess(c, "Impersonation successful", presenter.AuthResponse{
		APIKey: apiKey,
		User: presenter.UserResponse{
			ID:      user.ID,
			Name:    user.Name,
			Email:   user.Email,
			Credits: user.Credits,
			Role:    user.Role,
			Status:  user.Status,
		},
	})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid email address", "")
		return
	}

	_ = h.authService.ForgotPassword(input.Email)

	helper.SendSuccess(c, "If the email is registered, a verification code has been sent.", nil)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var input struct {
		Email    string `json:"email" binding:"required,email"`
		Code     string `json:"code" binding:"required,len=6"`
		Password string `json:"password" binding:"required,strong_password"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Email, 6-digit code, and password are required.", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.authService.ResetPassword(input.Email, input.Code, input.Password); err != nil {
		sendOTPError(c, err)
		return
	}

	helper.SendSuccess(c, "Password has been successfully reset. You can now login.", nil)
}

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
		Code  string `json:"code" binding:"required,len=6"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Email and 6-digit code are required.", "ERR_INVALID_REQUEST")
		return
	}

	if err := h.authService.VerifyEmail(input.Email, input.Code); err != nil {
		sendOTPError(c, err)
		return
	}

	helper.SendSuccess(c, "Email verified successfully. You can now login.", nil)
}

func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Valid email is required.", "")
		return
	}

	if err := h.authService.ResendVerification(input.Email); err != nil {
		sendOTPError(c, err)
		return
	}

	helper.SendSuccess(c, "If verification is required, a new code has been sent.", nil)
}

func (h *AuthHandler) ResendReset(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Valid email is required.", "")
		return
	}

	if err := h.authService.ResendReset(input.Email); err != nil {
		sendOTPError(c, err)
		return
	}

	helper.SendSuccess(c, "If the email is registered, a new code has been sent.", nil)
}

func sendOTPError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, helper.ErrOTPResendCooldownErr):
		helper.SendError(c, http.StatusTooManyRequests, "Please wait before requesting another code.", "ERR_OTP_COOLDOWN")
	case errors.Is(err, helper.ErrOTPTooManyAttempts):
		helper.SendError(c, http.StatusTooManyRequests, "Too many invalid attempts. Request a new code.", "ERR_OTP_ATTEMPTS")
	case errors.Is(err, helper.ErrOTPUnavailable):
		helper.SendError(c, http.StatusServiceUnavailable, "Verification service temporarily unavailable.", "ERR_OTP_UNAVAILABLE")
	case errors.Is(err, helper.ErrOTPInvalid):
		helper.SendError(c, http.StatusBadRequest, "Invalid or expired code.", "ERR_OTP_INVALID")
	default:
		helper.SendError(c, http.StatusBadRequest, err.Error(), "ERR_OTP_FAILED")
	}
}
