package service

import (
	"errors"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/security"
)

var (
	ErrCurrentPasswordRequired  = errors.New("current password is required")
	ErrCurrentPasswordIncorrect = errors.New("current password incorrect")
	ErrNoProfileUpdates         = errors.New("no updates provided")
	ErrWeakPassword             = errors.New("password does not meet strength requirements")
	ErrPasswordHashFailed       = errors.New("failed to update password")
	ErrWebhookSecretTooShort    = errors.New("webhook secret must be at least 16 characters")
)

type UserService interface {
	GetByID(id uint) (*model.User, error)
	UpdateProfile(id uint, name, currentPass, newPass string) error
	GetAllUsers() ([]model.User, error)
	UpdateWebhookSettings(id uint, url, secret string, regenerateSecret bool) (plainSecretOnce string, err error)
}

type userService struct {
	userRepo repo.UserRepo
}

func NewUserService(userRepo repo.UserRepo) UserService {
	return &userService{userRepo: userRepo}
}

func (s *userService) GetByID(id uint) (*model.User, error) {
	return s.userRepo.GetByID(id)
}

func (s *userService) UpdateProfile(id uint, name, currentPass, newPass string) error {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	updates := make(map[string]interface{})
	name = strings.TrimSpace(name)
	if name != "" {
		updates["name"] = name
	}

	if newPass != "" {
		if currentPass == "" {
			return ErrCurrentPasswordRequired
		}
		if !helper.CheckPasswordHash(currentPass, user.Password) {
			return ErrCurrentPasswordIncorrect
		}
		if !security.IsStrongPassword(newPass) {
			return ErrWeakPassword
		}
		hashed, err := helper.HashPassword(newPass)
		if err != nil || hashed == "" {
			return ErrPasswordHashFailed
		}
		updates["password"] = hashed
	}

	if len(updates) == 0 {
		return ErrNoProfileUpdates
	}

	return s.userRepo.Update(user, updates)
}

func (s *userService) GetAllUsers() ([]model.User, error) {
	return nil, errors.New("not implemented")
}

func (s *userService) UpdateWebhookSettings(id uint, rawURL, secret string, regenerateSecret bool) (string, error) {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return "", err
	}

	rawURL = strings.TrimSpace(rawURL)
	if err := security.ValidateWebhookURL(rawURL); err != nil {
		return "", err
	}

	updates := map[string]interface{}{
		"webhook_url": rawURL,
	}

	var plainOnce string
	switch {
	case rawURL == "":
		updates["webhook_secret"] = ""
	case regenerateSecret:
		plainOnce = "whsec_" + helper.GenerateRandomHex(24)
		updates["webhook_secret"] = plainOnce
	default:
		if sec := strings.TrimSpace(secret); sec != "" {
			if len(sec) < 16 {
				return "", ErrWebhookSecretTooShort
			}
			plainOnce = sec
			updates["webhook_secret"] = sec
		} else if user.WebhookSecret == "" {
			plainOnce = "whsec_" + helper.GenerateRandomHex(24)
			updates["webhook_secret"] = plainOnce
		}
		// else keep existing secret; only URL may change
	}

	if err := s.userRepo.Update(user, updates); err != nil {
		return "", err
	}
	return plainOnce, nil
}
