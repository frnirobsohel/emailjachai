package service

import (
	"errors"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
)

type AuthService interface {
	Register(firstName, lastName, email, password string) (*model.User, string, error)
	Login(email, password string) (*model.User, string, error)
}

type authService struct {
	userRepo      repo.UserRepo
	apiKeyService APIKeyService
}

func NewAuthService(userRepo repo.UserRepo, apiKeyService APIKeyService) AuthService {
	return &authService{userRepo: userRepo, apiKeyService: apiKeyService}
}

func (s *authService) Register(firstName, lastName, email, password string) (*model.User, string, error) {
	// Check if user exists
	existing, _ := s.userRepo.GetByEmail(email)
	if existing != nil {
		return nil, "", errors.New("user already exists")
	}

	hashedPassword, err := helper.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	user := &model.User{
		Name:     firstName + " " + lastName,
		Email:    email,
		Password: hashedPassword,
		Credits:  100, // Default signup credits
		Role:     "user",
		Status:   "Active",
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, "", err
	}

	// Create Login Key
	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	return user, apiKey, nil
}

func (s *authService) Login(email, password string) (*model.User, string, error) {
	user, err := s.userRepo.GetByEmail(email)
	if err != nil {
		return nil, "", errors.New("invalid email or password")
	}

	if !helper.CheckPasswordHash(password, user.Password) {
		return nil, "", errors.New("invalid email or password")
	}

	if user.Status == "Suspended" {
		return nil, "", errors.New("account suspended")
	}

	// Rotate or Create Login Key
	apiKey, err := s.apiKeyService.CreateLoginKey(user.ID)
	if err != nil {
		return nil, "", err
	}

	return user, apiKey, nil
}
