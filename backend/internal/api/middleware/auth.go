package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware implements 100% legacy parity for DB-backed Bearer API Keys.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			helper.SendError(c, http.StatusUnauthorized, "Authorization header is required", "ERR_UNAUTHORIZED")
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			helper.SendError(c, http.StatusUnauthorized, "Authorization header format must be Bearer {token}", "ERR_BAD_AUTH_FORMAT")
			c.Abort()
			return
		}

		tokenString := parts[1]

		if cached, ok := config.GetCachedAPIAuth(tokenString); ok {
			c.Set("userID", cached.UserID)
			c.Set("role", cached.Role)
			c.Set("apiKeyID", cached.APIKeyID)
			c.Next()
			return
		}

		// Compute SHA-256 hash of tokenString
		hasher := sha256.New()
		hasher.Write([]byte(tokenString))
		hashedKey := hex.EncodeToString(hasher.Sum(nil))

		prefix := ""
		if len(tokenString) >= 16 {
			prefix = tokenString[:16]
		}

		var k model.APIKey
		if err := config.DB.
			Select("id", "user_id", "api_key", "status", "last_used_at", "expires_at").
			Where("key_prefix = ? AND key = ?", prefix, hashedKey).
			First(&k).Error; err == nil {
			// 1. Check Key Status
			if k.Status != "active" {
				helper.SendError(c, http.StatusUnauthorized, "This API key has been revoked or expired.", "ERR_KEY_NOT_ACTIVE")
				c.Abort()
				return
			}

			// 2. Check Expiry
			if k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now()) {
				helper.SendError(c, http.StatusUnauthorized, "This API key has expired.", "ERR_KEY_EXPIRED")
				c.Abort()
				return
			}

			// 3. Check User
			var user model.User
			if err := config.DB.First(&user, k.UserID).Error; err != nil {
				helper.SendError(c, http.StatusUnauthorized, "User associated with this key not found.", "ERR_USER_NOT_FOUND")
				c.Abort()
				return
			}

			// 4. Check User Status (Legacy Parity)
			if strings.ToLower(user.Status) == "suspended" {
				helper.SendError(c, http.StatusForbidden, "Your account has been suspended.", "ERR_USER_SUSPENDED")
				c.Abort()
				return
			}

			// Success: Update last used and set context
			now := time.Now()
			if k.LastUsedAt == nil || k.LastUsedAt.Before(now.Add(-10*time.Minute)) {
				go func(apiKeyID uint, ts time.Time) {
					config.DB.Model(&model.APIKey{}).Where("id = ?", apiKeyID).Update("last_used_at", &ts)
				}(k.ID, now)
			}

			cacheTTL := 2 * time.Minute
			if k.ExpiresAt != nil {
				if remaining := time.Until(*k.ExpiresAt); remaining > 0 && remaining < cacheTTL {
					cacheTTL = remaining
				}
			}
			config.SetCachedAPIAuth(tokenString, config.CachedAPIAuth{
				UserID:   user.ID,
				Role:     user.Role,
				APIKeyID: k.ID,
			}, cacheTTL)

			c.Set("userID", user.ID)
			c.Set("role", user.Role)
			c.Set("apiKeyID", k.ID)
			c.Next()
			return
		}

		helper.SendError(c, http.StatusUnauthorized, "Invalid Authorization token", "ERR_AUTH_INVALID")
		c.Abort()
	}
}

func WSAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.Query("token")
		if tokenString == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenString = parts[1]
				}
			}
		}

		if tokenString == "" {
			helper.SendError(c, http.StatusUnauthorized, "Token is required", "ERR_UNAUTHORIZED")
			c.Abort()
			return
		}

		if token, claims, err := helper.VerifyJWT(tokenString); err == nil && token.Valid {
			if purpose, ok := claims["purpose"].(string); ok && purpose == "websocket" {
				if userIDFloat, ok := claims["userID"].(float64); ok {
					c.Set("userID", uint(userIDFloat))
					if role, ok := claims["role"].(string); ok {
						c.Set("role", role)
					}
					c.Next()
					return
				}
			}
		}

		if cached, ok := config.GetCachedAPIAuth(tokenString); ok {
			c.Set("userID", cached.UserID)
			c.Set("role", cached.Role)
			c.Set("apiKeyID", cached.APIKeyID)
			c.Next()
			return
		}

		// Compute SHA-256 hash of tokenString
		hasher := sha256.New()
		hasher.Write([]byte(tokenString))
		hashedKey := hex.EncodeToString(hasher.Sum(nil))

		prefix := ""
		if len(tokenString) >= 16 {
			prefix = tokenString[:16]
		}

		var k model.APIKey
		if err := config.DB.Select("id", "user_id", "api_key", "status", "expires_at").
			Where("key_prefix = ? AND key = ?", prefix, hashedKey).First(&k).Error; err == nil {
			if k.Status != "active" || (k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now())) {
				helper.SendError(c, http.StatusUnauthorized, "Invalid token", "ERR_AUTH_INVALID")
				c.Abort()
				return
			}
			var user model.User
			if err := config.DB.First(&user, k.UserID).Error; err == nil && strings.ToLower(user.Status) != "suspended" {
				config.SetCachedAPIAuth(tokenString, config.CachedAPIAuth{
					UserID: user.ID, Role: user.Role, APIKeyID: k.ID,
				}, 2*time.Minute)

				c.Set("userID", user.ID)
				c.Set("role", user.Role)
				c.Set("apiKeyID", k.ID)
				c.Next()
				return
			}
		}

		helper.SendError(c, http.StatusUnauthorized, "Invalid token", "ERR_AUTH_INVALID")
		c.Abort()
	}
}



