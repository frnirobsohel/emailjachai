package helper

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateRandomKey generates a secure random string (hex encoded, 32 bytes → 64 hex chars).
// Panics if the OS CSPRNG fails — empty keys must never be issued.
func GenerateRandomKey() string {
	return GenerateRandomHex(32)
}

// GenerateRandomHex generates a secure random hex string of n bytes.
// Panics if crypto/rand fails (fail-closed; never returns "").
func GenerateRandomHex(n int) string {
	s, err := GenerateRandomHexE(n)
	if err != nil {
		panic(fmt.Sprintf("helper.GenerateRandomHex: crypto/rand failed: %v", err))
	}
	return s
}

// GenerateRandomHexE is the error-returning variant for callers that prefer explicit handling.
func GenerateRandomHexE(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("invalid length %d", n)
	}
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
