// Package security provides application-level security primitives that sit
// above the standard library and can be shared across multiple layers
// (service, middleware, background jobs).
//
// This package is intentionally thin — it delegates to the well-tested
// internal/helper primitives for crypto/JWT/hashing so there is a single
// source of truth, while exposing higher-level, domain-aware helpers here.
//
// Functions in internal/helper (crypto.go, hash.go, jwt.go) remain in place
// for backward compatibility; this package wraps or extends them.
package security

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// API Key generation & masking
// ─────────────────────────────────────────────────────────────────────────────

const (
	apiKeyPrefix = "ejp_"
	apiKeyBytes  = 32 // 256-bit entropy → 43-char base64url string
)

// GenerateAPIKey returns a new, cryptographically-random API key in the form:
//
//	ejp_<base64url-of-32-random-bytes>
//
// Example: ejp_X7kLp2mQrN9vTwZo...
func GenerateAPIKey() (string, error) {
	raw := make([]byte, apiKeyBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("security: failed to generate API key: %w", err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	return apiKeyPrefix + encoded, nil
}

// MaskAPIKey returns a redacted version of an API key safe for display in logs
// or the UI (shows prefix + first 4 chars + "..." + last 4 chars).
//
//	ejp_X7kL...Zo9v
func MaskAPIKey(key string) string {
	if len(key) <= len(apiKeyPrefix)+8 {
		return key[:min(4, len(key))] + "..."
	}
	start := key[:len(apiKeyPrefix)+4]
	end := key[len(key)-4:]
	return start + "..." + end
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker key generation
// ─────────────────────────────────────────────────────────────────────────────

// GenerateWorkerKey returns a 64-character hex worker authentication key.
// This is used by the Admin to issue keys to Worker nodes.
func GenerateWorkerKey() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("security: failed to generate worker key: %w", err)
	}
	return fmt.Sprintf("%x", raw), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP / short-lived PIN generation
// ─────────────────────────────────────────────────────────────────────────────

// GenerateOTP returns a cryptographically-random N-digit numeric OTP string.
// Panics if n < 1 or n > 8.
func GenerateOTP(n int) (string, error) {
	if n < 1 || n > 8 {
		return "", fmt.Errorf("security: OTP length must be between 1 and 8, got %d", n)
	}
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("security: failed to generate OTP: %w", err)
	}
	digits := make([]byte, n)
	for i, b := range raw {
		digits[i] = '0' + (b % 10)
	}
	return string(digits), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit key helpers
// ─────────────────────────────────────────────────────────────────────────────

// RateLimitKey returns a normalized Redis key for rate-limiting a given action
// per IP address and per UTC minute window.
//
//	Example: "rl:login:192.168.1.1:2024-01-15T10:30"
func RateLimitKey(action, ip string) string {
	window := time.Now().UTC().Format("2006-01-02T15:04")
	return fmt.Sprintf("rl:%s:%s:%s", action, sanitizeIP(ip), window)
}

// sanitizeIP strips port and brackets from an IP:port string.
func sanitizeIP(ip string) string {
	ip = strings.TrimSpace(ip)
	// IPv6 with port: [::1]:8080
	if strings.HasPrefix(ip, "[") {
		if end := strings.Index(ip, "]"); end != -1 {
			return ip[1:end]
		}
	}
	// IPv4 with port: 127.0.0.1:8080
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		// Only strip port if what remains looks like an IP (no colons = IPv4)
		host := ip[:idx]
		if !strings.Contains(host, ":") {
			return host
		}
	}
	return ip
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
