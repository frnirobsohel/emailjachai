package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
)

type APIKeyService interface {
	CreateLoginKey(userID uint) (string, error)
	ValidateKey(key string) (*model.APIKey, error)
	GetByUserID(userID uint) ([]model.APIKey, error)
	Create(userID uint, name string) (*model.APIKey, error)
	Delete(id uint, userID uint) error
	Rotate(id uint, userID uint) (*model.APIKey, error)
}

type apiKeyService struct {
	repo repo.APIKeyRepo
}

func NewAPIKeyService(repo repo.APIKeyRepo) APIKeyService {
	return &apiKeyService{repo: repo}
}

func (s *apiKeyService) CreateLoginKey(userID uint) (string, error) {
	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hashedKey, _ := helper.HashPassword(plainKey)

	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      "Login Key",
		APIKey:    hashedKey,
		Key:       hashedKey,
		KeyPrefix: prefix,
		Status:    "active",
	}

	if err := s.repo.Create(apiKey); err != nil {
		return "", err
	}

	return plainKey, nil
}

func (s *apiKeyService) ValidateKey(key string) (*model.APIKey, error) {
	return s.repo.GetByKey(key)
}

func (s *apiKeyService) GetByUserID(userID uint) ([]model.APIKey, error) {
	return s.repo.GetByUserID(userID)
}

func (s *apiKeyService) Create(userID uint, name string) (*model.APIKey, error) {
	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hashedKey, _ := helper.HashPassword(plainKey)

	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      name,
		APIKey:    hashedKey,
		Key:       hashedKey,
		KeyPrefix: prefix,
		Status:    "active",
	}

	if err := s.repo.Create(apiKey); err != nil {
		return nil, err
	}

	// Temporarily store plain key to return to user once
	apiKey.APIKey = plainKey
	return apiKey, nil
}

func (s *apiKeyService) Delete(id uint, userID uint) error {
	return s.repo.Delete(id, userID)
}

func (s *apiKeyService) Rotate(id uint, userID uint) (*model.APIKey, error) {
	key, err := s.repo.GetByID(id)
	if err != nil || key.UserID != userID {
		return nil, err
	}

	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hashedKey, _ := helper.HashPassword(plainKey)

	updates := map[string]interface{}{
		"api_key":    hashedKey,
		"key":        hashedKey,
		"key_prefix": prefix,
	}

	if err := s.repo.Update(key, updates); err != nil {
		return nil, err
	}

	key.APIKey = plainKey // Return plain key once
	return key, nil
}
