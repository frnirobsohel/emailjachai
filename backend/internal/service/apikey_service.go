package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"
)

var (
	ErrMaxAPIKeys          = errors.New("maximum 5 active API keys allowed per user")
	ErrReservedKeyName     = errors.New("reserved key name")
	ErrSystemKeyProtected  = errors.New("system keys cannot be modified")
	ErrAPIKeyNotFound      = errors.New("api key not found")
	ErrAPIKeyNotActive     = errors.New("api key is not active")
	ErrAPIKeyGenerateFailed = errors.New("failed to generate secure api key")
)

const (
	loginKeyName         = "Login Key"
	impersonationKeyName = "Impersonation Key"
)

type APIKeyService interface {
	CreateLoginKey(userID uint) (string, error)
	CreateImpersonationKey(userID uint) (string, error)
	ValidateKey(key string) (*model.APIKey, error)
	GetByUserID(userID uint) ([]model.APIKey, error)
	Create(userID uint, name string) (*model.APIKey, error)
	Delete(id uint, userID uint) error
	Rotate(id uint, userID uint) (*model.APIKey, error)
	InvalidateCacheByKeyID(keyID uint)
}

type apiKeyService struct {
	repo repo.APIKeyRepo
}

func NewAPIKeyService(repo repo.APIKeyRepo) APIKeyService {
	return &apiKeyService{repo: repo}
}

func isSystemKeyName(name string) bool {
	n := strings.TrimSpace(name)
	return strings.EqualFold(n, loginKeyName) || strings.EqualFold(n, impersonationKeyName)
}

func newPlainAPIKey() (plainKey, prefix, hashedKey string, err error) {
	suffix, err := helper.GenerateRandomHexE(32)
	if err != nil || suffix == "" {
		return "", "", "", ErrAPIKeyGenerateFailed
	}
	plainKey = "ak_live_" + suffix
	if len(plainKey) < 16 {
		return "", "", "", ErrAPIKeyGenerateFailed
	}
	prefix = plainKey[:16]
	sum := sha256.Sum256([]byte(plainKey))
	hashedKey = hex.EncodeToString(sum[:])
	return plainKey, prefix, hashedKey, nil
}

func (s *apiKeyService) CreateLoginKey(userID uint) (string, error) {
	plainKey, prefix, hashedKey, err := newPlainAPIKey()
	if err != nil {
		return "", err
	}

	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      loginKeyName,
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
	plainKey, prefix, hashedKey, err := newPlainAPIKey()
	if err != nil {
		return "", err
	}

	expiry := time.Now().Add(20 * time.Minute)
	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      impersonationKeyName,
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
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name is required")
	}
	if isSystemKeyName(name) {
		return nil, ErrReservedKeyName
	}

	keys, err := s.repo.GetByUserID(userID)
	if err == nil {
		activeCount := 0
		for _, k := range keys {
			if k.Status == "active" && !isSystemKeyName(k.Name) {
				activeCount++
			}
		}
		if activeCount >= 5 {
			return nil, ErrMaxAPIKeys
		}
	}

	plainKey, prefix, hashedKey, err := newPlainAPIKey()
	if err != nil {
		return nil, err
	}

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

	// Return plaintext once via APIKey field (handler maps to DTO)
	apiKey.APIKey = plainKey
	apiKey.Key = ""
	return apiKey, nil
}

func (s *apiKeyService) Delete(id uint, userID uint) error {
	key, err := s.repo.GetByID(id)
	if err != nil {
		return ErrAPIKeyNotFound
	}
	if key.UserID != userID {
		return ErrAPIKeyNotFound
	}
	if isSystemKeyName(key.Name) {
		return ErrSystemKeyProtected
	}

	if err := s.repo.Delete(id, userID); err != nil {
		return err
	}
	return nil
}

func (s *apiKeyService) InvalidateCacheByKeyID(keyID uint) {
	config.ClearCachedAPIAuthByKeyID(keyID)
}

func (s *apiKeyService) Rotate(id uint, userID uint) (*model.APIKey, error) {
	key, err := s.repo.GetByID(id)
	if err != nil || key.UserID != userID {
		return nil, ErrAPIKeyNotFound
	}
	if isSystemKeyName(key.Name) {
		return nil, ErrSystemKeyProtected
	}
	if key.Status != "active" {
		return nil, ErrAPIKeyNotActive
	}

	plainKey, prefix, hashedKey, err := newPlainAPIKey()
	if err != nil {
		return nil, err
	}

	updates := map[string]interface{}{
		"api_key":    hashedKey,
		"key":        hashedKey,
		"key_prefix": prefix,
	}

	if err := s.repo.Update(key, updates); err != nil {
		return nil, err
	}

	key.APIKey = plainKey
	key.Key = ""
	key.KeyPrefix = prefix
	return key, nil
}
