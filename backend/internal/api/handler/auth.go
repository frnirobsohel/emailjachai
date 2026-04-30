package handler

import (
	"net/http"

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
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var input request.LoginRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	user, apiKey, err := h.authService.Login(input.Email, input.Password)
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
		ID:      user.ID,
		Name:    user.Name,
		Email:   user.Email,
		Credits: user.Credits,
		Role:    user.Role,
	})
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("userID")

	var input request.UpdateProfileRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	newPass := input.NewPassword
	if newPass == "" {
		newPass = input.Password
	}

	err := h.userService.UpdateProfile(userID.(uint), input.Name, input.CurrentPassword, newPass)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "Profile updated successfully", nil)
}

func (h *AuthHandler) Impersonate(c *gin.Context) {
	// Logic for impersonation usually involves generating a new token/key for target user
	// This can be refactored into a service later if needed.
	helper.SendError(c, http.StatusNotImplemented, "Impersonation refactor in progress", "")
}
