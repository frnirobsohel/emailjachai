package repo

import (
	"crypto/sha256"
	"encoding/hex"
	"ejp-backend/internal/model"
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
// It computes the SHA-256 hash and performs an indexed O(1) query.
func (r *apiKeyRepo) GetByKey(key string) (*model.APIKey, error) {
	prefix := ""
	if len(key) >= 16 {
		prefix = key[:16]
	}

	hasher := sha256.New()
	hasher.Write([]byte(key))
	hashedKey := hex.EncodeToString(hasher.Sum(nil))

	var apiKey model.APIKey
	if err := r.db.Where("key_prefix = ? AND key = ? AND status = 'active'", prefix, hashedKey).First(&apiKey).Error; err != nil {
		return nil, err
	}

	return &apiKey, nil
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
