package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/helper"
	"ejp-backend/pkg/config"
)

type APIKeyService interface {
	CreateLoginKey(userID uint) (string, error)
	CreateImpersonationKey(userID uint) (string, error)
	ValidateKey(key string) (*model.APIKey, error)
	GetByUserID(userID uint) ([]model.APIKey, error)
	Create(userID uint, name string) (*model.APIKey, error)
	Delete(id uint, userID uint) error
	Rotate(id uint, userID uint) (*model.APIKey, error)
	// InvalidateCacheByKeyID immediately removes the given key from the auth cache
	// so a revoked/rotated key stops working without waiting for TTL expiry.
	InvalidateCacheByKeyID(keyID uint)
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
	hasher := sha256.New()
	hasher.Write([]byte(plainKey))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

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

func (s *apiKeyService) CreateImpersonationKey(userID uint) (string, error) {
	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hasher := sha256.New()
	hasher.Write([]byte(plainKey))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

	expiry := time.Now().Add(20 * time.Minute)
	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      "Impersonation Key",
		APIKey:    hashedKey,
		Key:       hashedKey,
		KeyPrefix: prefix,
		Status:    "active",
		ExpiresAt: &expiry,
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
	// Check max 5 active keys rule
	keys, err := s.repo.GetByUserID(userID)
	if err == nil {
		activeCount := 0
		for _, k := range keys {
			if k.Status == "active" && k.Name != "Login Key" && k.Name != "Impersonation Key" {
				activeCount++
			}
		}
		if activeCount >= 5 {
			return nil, errors.New("maximum 5 active API keys allowed per user")
		}
	}

	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hasher := sha256.New()
	hasher.Write([]byte(plainKey))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

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

// InvalidateCacheByKeyID immediately evicts the auth cache entries for the
// given key ID so the key stops being accepted within the same process.
func (s *apiKeyService) InvalidateCacheByKeyID(keyID uint) {
	config.ClearCachedAPIAuthByKeyID(keyID)
}

func (s *apiKeyService) Rotate(id uint, userID uint) (*model.APIKey, error) {
	key, err := s.repo.GetByID(id)
	if err != nil || key.UserID != userID {
		return nil, err
	}

	plainKey := "ak_live_" + helper.GenerateRandomKey()
	prefix := plainKey[:16]
	hasher := sha256.New()
	hasher.Write([]byte(plainKey))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

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
