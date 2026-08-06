package helper

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"ejp-backend/pkg/config"

	"github.com/redis/go-redis/v9"
)

const (
	OTPTTL            = 15 * time.Minute
	OTPResendCooldown = 60 * time.Second
	OTPMaxAttempts    = 5
)

type OTPPurpose string

const (
	OTPVerify OTPPurpose = "verify"
	OTPReset  OTPPurpose = "reset"
)

var (
	ErrOTPUnavailable      = errors.New("verification service temporarily unavailable")
	ErrOTPInvalid          = errors.New("invalid or expired code")
	ErrOTPTooManyAttempts  = errors.New("too many invalid attempts; request a new code")
	ErrOTPResendCooldownErr = errors.New("please wait before requesting another code")
)

func otpCodeKey(purpose OTPPurpose, email string) string {
	return fmt.Sprintf("otp:%s:%s", purpose, strings.ToLower(strings.TrimSpace(email)))
}

func otpCooldownKey(purpose OTPPurpose, email string) string {
	return fmt.Sprintf("otp:cd:%s:%s", purpose, strings.ToLower(strings.TrimSpace(email)))
}

func otpAttemptsKey(purpose OTPPurpose, email string) string {
	return fmt.Sprintf("otp:att:%s:%s", purpose, strings.ToLower(strings.TrimSpace(email)))
}

// GenerateOTPCode returns a cryptographically random 6-digit code.
func GenerateOTPCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func HashOTP(code string) string {
	mac := hmac.New(sha256.New, getSecretKey())
	_, _ = mac.Write([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(mac.Sum(nil))
}

func CompareOTPHash(code, hash string) bool {
	expected := HashOTP(code)
	if len(expected) != len(hash) {
		return false
	}
	var diff byte
	for i := 0; i < len(expected); i++ {
		diff |= expected[i] ^ hash[i]
	}
	return diff == 0
}

// IssueOTP stores a new hashed OTP and starts the resend cooldown. Returns the plaintext code once.
func IssueOTP(purpose OTPPurpose, email string) (string, error) {
	if config.Redis == nil {
		return "", ErrOTPUnavailable
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", ErrOTPInvalid
	}

	code, err := GenerateOTPCode()
	if err != nil {
		return "", err
	}

	ctx := config.Ctx
	pipe := config.Redis.TxPipeline()
	pipe.Set(ctx, otpCodeKey(purpose, email), HashOTP(code), OTPTTL)
	pipe.Del(ctx, otpAttemptsKey(purpose, email))
	pipe.Set(ctx, otpCooldownKey(purpose, email), "1", OTPResendCooldown)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", ErrOTPUnavailable
	}
	return code, nil
}

// CheckOTPResendCooldown returns ErrOTPResendCooldownErr when a resend is too soon.
func CheckOTPResendCooldown(purpose OTPPurpose, email string) error {
	if config.Redis == nil {
		return ErrOTPUnavailable
	}
	n, err := config.Redis.Exists(config.Ctx, otpCooldownKey(purpose, email)).Result()
	if err != nil {
		return ErrOTPUnavailable
	}
	if n > 0 {
		return ErrOTPResendCooldownErr
	}
	return nil
}

// VerifyOTP validates the code and deletes it on success. Failed attempts are counted.
func VerifyOTP(purpose OTPPurpose, email, code string) error {
	if config.Redis == nil {
		return ErrOTPUnavailable
	}
	email = strings.ToLower(strings.TrimSpace(email))
	code = strings.TrimSpace(code)
	if email == "" || len(code) != 6 {
		return ErrOTPInvalid
	}

	ctx := config.Ctx
	attemptsKey := otpAttemptsKey(purpose, email)
	attempts, err := config.Redis.Get(ctx, attemptsKey).Int()
	if err != nil && err != redis.Nil {
		return ErrOTPUnavailable
	}
	if attempts >= OTPMaxAttempts {
		return ErrOTPTooManyAttempts
	}

	hash, err := config.Redis.Get(ctx, otpCodeKey(purpose, email)).Result()
	if err == redis.Nil || hash == "" {
		return ErrOTPInvalid
	}
	if err != nil {
		return ErrOTPUnavailable
	}

	if !CompareOTPHash(code, hash) {
		n, incrErr := config.Redis.Incr(ctx, attemptsKey).Result()
		if incrErr == nil {
			_ = config.Redis.Expire(ctx, attemptsKey, OTPTTL).Err()
			if n >= OTPMaxAttempts {
				_ = config.Redis.Del(ctx, otpCodeKey(purpose, email)).Err()
				return ErrOTPTooManyAttempts
			}
		}
		return ErrOTPInvalid
	}

	_ = config.Redis.Del(ctx, otpCodeKey(purpose, email), attemptsKey, otpCooldownKey(purpose, email)).Err()
	return nil
}
