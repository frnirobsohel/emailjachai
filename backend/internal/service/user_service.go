package service

import (
	"errors"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
)

type UserService interface {
	GetByID(id uint) (*model.User, error)
	UpdateProfile(id uint, name, currentPass, newPass string) error
	GetAllUsers() ([]model.User, error)
	UpdateWebhookSettings(id uint, url, secret string) error
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
	if name != "" {
		updates["name"] = name
	}

	if newPass != "" {
		if currentPass == "" {
			return errors.New("current password is required")
		}
		if !helper.CheckPasswordHash(currentPass, user.Password) {
			return errors.New("current password incorrect")
		}
		hashed, _ := helper.HashPassword(newPass)
		updates["password"] = hashed
	}

	if len(updates) == 0 {
		return errors.New("no updates provided")
	}

	return s.userRepo.Update(user, updates)
}

func (s *userService) GetAllUsers() ([]model.User, error) {
	// This would typically have pagination, but for now matching legacy
	return nil, errors.New("not implemented")
}

func (s *userService) UpdateWebhookSettings(id uint, url, secret string) error {
	user, err := s.userRepo.GetByID(id)
	if err != nil {
		return err
	}

	updates := map[string]interface{}{
		"webhook_url":    url,
		"webhook_secret": secret,
	}

	return s.userRepo.Update(user, updates)
}
