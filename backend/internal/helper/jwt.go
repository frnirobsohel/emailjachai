package helper

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var secretKey = []byte(os.Getenv("JWT_SECRET"))

// GenerateToken creates a new JWT token for a user.
func GenerateToken(userID uint, role string) (string, error) {
	// Fallback for development if not set in .env
	if len(secretKey) == 0 {
		secretKey = []byte("super-secret-key-change-me-in-production")
	}

	claims := jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"exp":  time.Now().Add(time.Hour * 72).Unix(), // Token valid for 72 hours
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secretKey)
}



