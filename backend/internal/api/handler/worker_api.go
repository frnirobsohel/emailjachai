package handler

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

// Note: WorkerReportPayload and WorkerBatchPayload are defined in the service package.
// WorkerAuthMiddleware and related worker-key helpers live here since they are
// infrastructure concerns, not business logic.

var workerAuthSettingsCache struct {
	mu        sync.RWMutex
	hash      string
	encrypted string
	expiresAt time.Time
}

func getWorkerAuthSettings() (string, string) {
	now := time.Now()

	workerAuthSettingsCache.mu.RLock()
	if now.Before(workerAuthSettingsCache.expiresAt) {
		hash := workerAuthSettingsCache.hash
		encrypted := workerAuthSettingsCache.encrypted
		workerAuthSettingsCache.mu.RUnlock()
		return hash, encrypted
	}
	workerAuthSettingsCache.mu.RUnlock()

	var hashSetting model.Setting
	var encSetting model.Setting
	hash := ""
	encrypted := ""

	if err := config.DB.Select("setting_value").Where("setting_key = ?", "worker_api_key_hash").First(&hashSetting).Error; err == nil {
		hash = hashSetting.SettingValue
	}
	if err := config.DB.Select("setting_value").Where("setting_key = ?", "worker_api_key_encrypted").First(&encSetting).Error; err == nil {
		encrypted = encSetting.SettingValue
	}

	workerAuthSettingsCache.mu.Lock()
	workerAuthSettingsCache.hash = hash
	workerAuthSettingsCache.encrypted = encrypted
	workerAuthSettingsCache.expiresAt = now.Add(1 * time.Minute)
	workerAuthSettingsCache.mu.Unlock()

	return hash, encrypted
}

// WorkerAuthMiddleware validates requests from workers using SHA-256 tokens stored in settings.
func WorkerAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		rawKey := ""

		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if strings.HasPrefix(authHeader, "Bearer ") {
			rawKey = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		}
		if rawKey == "" {
			rawKey = strings.TrimSpace(c.GetHeader("X-Worker-Key"))
		}

		if rawKey == "" {
			helper.SendError(c, http.StatusUnauthorized, "Unauthorized worker access. Worker API key missing.", "ERR_WORKER_KEY_MISSING")
			c.Abort()
			return
		}

		envPlainKey := strings.TrimSpace(os.Getenv("WORKER_API_KEY"))

		// Fast path: env key match (constant-time to prevent timing attacks)
		if envPlainKey != "" && subtle.ConstantTimeCompare([]byte(rawKey), []byte(envPlainKey)) == 1 {
			c.Next()
			return
		}

		expectedHash, encryptedKey := getWorkerAuthSettings()

		// Legacy hashing: sha256("worker-key|" + key)
		legacySum := sha256.Sum256([]byte("worker-key|" + rawKey))
		legacyHash := hex.EncodeToString(legacySum[:])

		// Backwards compatibility: some early migrations used sha256(key)
		rawSum := sha256.Sum256([]byte(rawKey))
		rawHash := hex.EncodeToString(rawSum[:])

		// 1. Check against DB hash
		if expectedHash != "" {
			if subtle.ConstantTimeCompare([]byte(expectedHash), []byte(legacyHash)) == 1 ||
				subtle.ConstantTimeCompare([]byte(expectedHash), []byte(rawHash)) == 1 {
				c.Next()
				return
			}
		}

		// 2. Fallback: check encrypted setting if it exists
		if encryptedKey != "" {
			plain, _ := helper.DecryptSecret(encryptedKey)
			if plain != "" && subtle.ConstantTimeCompare([]byte(rawKey), []byte(plain)) == 1 {
				c.Next()
				return
			}
		}

		logger.Warn("Worker Auth Failed", "received_key_len", len(rawKey))
		helper.SendError(c, http.StatusUnauthorized, "Invalid worker API key.", "ERR_WORKER_KEY_INVALID")
		c.Abort()
	}
}
