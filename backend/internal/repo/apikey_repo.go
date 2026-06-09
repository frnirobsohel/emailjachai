package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type APIKeyRepo interface {
	GetByID(id uint) (*model.APIKey, error)
	GetByUserID(userID uint) ([]model.APIKey, error)
	GetByKey(key string) (*model.APIKey, error)
	Create(key *model.APIKey) error
	Update(key *model.APIKey, updates map[string]interface{}) error
	Delete(id uint, userID uint) error
}

type apiKeyRepo struct {
	db *gorm.DB
}

func NewAPIKeyRepo() APIKeyRepo {
	return &apiKeyRepo{db: config.DB}
}

func (r *apiKeyRepo) GetByID(id uint) (*model.APIKey, error) {
	var key model.APIKey
	if err := r.db.First(&key, id).Error; err != nil {
		return nil, err
	}
	return &key, nil
}

func (r *apiKeyRepo) GetByUserID(userID uint) ([]model.APIKey, error) {
	var keys []model.APIKey
	err := r.db.Where("user_id = ? AND status != 'revoked'", userID).Find(&keys).Error
	return keys, err
}

// GetByKey finds an API key record by its plaintext key value.
// WARNING: This performs a direct DB equality match (NOT bcrypt comparison).
// This is used for prefix-based key lookup only (e.g., finding which user owns a key).
// For actual authentication, the auth middleware extracts the prefix, finds the key
// via this method, then verifies the full key against the stored hash using bcrypt.
// Do NOT use this method alone for authentication purposes.
func (r *apiKeyRepo) GetByKey(key string) (*model.APIKey, error) {
	prefix := ""
	if len(key) >= 16 {
		prefix = key[:16]
	}

	var keys []model.APIKey
	if err := r.db.Where("key_prefix = ? AND status = 'active'", prefix).Find(&keys).Error; err != nil {
		return nil, err
	}

	for _, k := range keys {
		if helper.CheckPasswordHash(key, k.APIKey) {
			return &k, nil
		}
	}

	return nil, gorm.ErrRecordNotFound
}

func (r *apiKeyRepo) Create(key *model.APIKey) error {
	return r.db.Create(key).Error
}

func (r *apiKeyRepo) Update(key *model.APIKey, updates map[string]interface{}) error {
	return r.db.Model(key).Updates(updates).Error
}

func (r *apiKeyRepo) Delete(id uint, userID uint) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.APIKey{}).Error
}
