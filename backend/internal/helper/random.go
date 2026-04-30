package helper

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateRandomKey generates a secure random string (hex encoded)
func GenerateRandomKey() string {
	return GenerateRandomHex(32)
}

// GenerateRandomHex generates a secure random hex string of n bytes
func GenerateRandomHex(n int) string {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	return hex.EncodeToString(bytes)
}



