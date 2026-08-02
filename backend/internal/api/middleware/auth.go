package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// wsAuthProtocolPrefix is the Sec-WebSocket-Protocol carrier for browser JWT auth.
// Browsers cannot set Authorization on WebSocket handshakes, so the token is
// base64url-encoded into a negotiated subprotocol instead of a URL query param.
const wsAuthProtocolPrefix = "ejp.jwt."

// AuthMiddleware implements 100% legacy parity for DB-backed Bearer API Keys.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			helper.SendError(c, http.StatusUnauthorized, "Missing Authorization header.", "ERR_MISSING_AUTH_HEADER")
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			helper.SendError(c, http.StatusUnauthorized, "Invalid Authorization header format. Expected 'Bearer <key>'.", "ERR_INVALID_AUTH_FORMAT")
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
		if err := config.DB.Select("id", "user_id", "api_key", "status", "expires_at", "last_used_at").
			Where("key_prefix = ? AND key = ?", prefix, hashedKey).First(&k).Error; err == nil {
			if k.Status != "active" || (k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now())) {
				helper.SendError(c, http.StatusUnauthorized, "Invalid token", "ERR_AUTH_INVALID")
				c.Abort()
				return
			}
			var user model.User
			if err := config.DB.First(&user, k.UserID).Error; err == nil && strings.ToLower(user.Status) != "suspended" {
				now := time.Now()
				if k.LastUsedAt == nil || k.LastUsedAt.Before(now.Add(-10*time.Minute)) {
					apiKeyID := k.ID
					ts := now
					safe.Go(func() {
						config.DB.Model(&model.APIKey{}).Where("id = ?", apiKeyID).Update("last_used_at", &ts)
					})
				}

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

		helper.SendError(c, http.StatusUnauthorized, "Invalid Authorization token", "ERR_AUTH_INVALID")
		c.Abort()
	}
}

func extractWSToken(c *gin.Context) (token string, selectedProtocol string) {
	for _, protocol := range websocket.Subprotocols(c.Request) {
		if !strings.HasPrefix(protocol, wsAuthProtocolPrefix) {
			continue
		}
		encoded := strings.TrimPrefix(protocol, wsAuthProtocolPrefix)
		raw, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			// Some clients may include padding
			raw, err = base64.URLEncoding.DecodeString(encoded)
		}
		if err == nil && len(raw) > 0 {
			return string(raw), protocol
		}
	}

	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != "" {
			return parts[1], ""
		}
	}

	return "", ""
}

func WSAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString, selectedProtocol := extractWSToken(c)
		if tokenString == "" {
			helper.SendError(c, http.StatusUnauthorized, "Token is required", "ERR_UNAUTHORIZED")
			c.Abort()
			return
		}
		if selectedProtocol != "" {
			c.Set("wsSubprotocol", selectedProtocol)
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



