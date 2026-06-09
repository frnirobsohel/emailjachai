package helper

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func getSecretKey() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return []byte("super_secret_jwt_key_here_change_in_production")
	}
	return []byte(secret)
}

// GenerateToken creates a new JWT token for a user.
func GenerateToken(userID uint, role string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"exp":  time.Now().Add(time.Hour * 72).Unix(), // Token valid for 72 hours
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getSecretKey())
}

// VerifyJWT parses and validates a JWT token.
func VerifyJWT(tokenString string) (*jwt.Token, jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return getSecretKey(), nil
	})

	if err != nil {
		return nil, nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return token, claims, nil
	}

	return nil, nil, jwt.ErrTokenInvalidClaims
}

// GenerateResetToken creates a short-lived token for password reset
func GenerateResetToken(email string) (string, error) {
	claims := jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 1).Unix(), // 1 hour expiration
		"type":  "reset",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getSecretKey())
}

// VerifyResetToken validates the reset token and returns the email
func VerifyResetToken(tokenString string) (string, error) {
	_, claims, err := VerifyJWT(tokenString)
	if err != nil {
		return "", err
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "reset" {
		return "", jwt.ErrTokenInvalidClaims
	}

	email, ok := claims["email"].(string)
	if !ok {
		return "", jwt.ErrTokenInvalidClaims
	}

	return email, nil
}

// GenerateVerificationToken creates a short-lived token for email verification
func GenerateVerificationToken(email string) (string, error) {
	claims := jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 24).Unix(), // 24 hours expiration
		"type":  "verify",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getSecretKey())
}

// VerifyVerificationToken validates the verification token and returns the email
func VerifyVerificationToken(tokenString string) (string, error) {
	_, claims, err := VerifyJWT(tokenString)
	if err != nil {
		return "", err
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "verify" {
		return "", jwt.ErrTokenInvalidClaims
	}

	email, ok := claims["email"].(string)
	if !ok {
		return "", jwt.ErrTokenInvalidClaims
	}

	return email, nil
}
