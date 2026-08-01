package helper

import (
	"strings"
)

// LooksEncryptedSecret reports whether stored value looks like our cipher blob
// (gcm:… or legacy base64:hex). Plain provider keys must not be treated as ciphertext.
func LooksEncryptedSecret(stored string) bool {
	stored = strings.TrimSpace(stored)
	if stored == "" {
		return false
	}
	if strings.HasPrefix(stored, "gcm:") {
		return true
	}
	// Legacy AES-CTR: base64:hex(iv)
	parts := strings.SplitN(stored, ":", 2)
	if len(parts) != 2 {
		return false
	}
	if parts[0] == "" || parts[1] == "" {
		return false
	}
	// Stripe/PayPal keys never look like base64:hex-iv; require hex-looking IV (16 or 12 bytes → 32/24 hex).
	iv := parts[1]
	if len(iv) != 24 && len(iv) != 32 {
		return false
	}
	for _, c := range iv {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// EncryptPaymentSecret encrypts payment gateway secrets with JWT_SECRET (same as other app secrets).
func EncryptPaymentSecret(plain string) (string, error) {
	return EncryptSecret(plain)
}

// DecryptPaymentSecret decrypts payment gateway secrets with JWT_SECRET.
func DecryptPaymentSecret(stored string) (string, error) {
	return DecryptSecret(stored)
}

// ResolveAPIBaseURL returns the public API origin for payment webhooks.
// Uses Admin → Payment Settings (api_base_url). If empty, defaults to http://localhost:8000.
// Never uses FRONTEND_URL or env — configure via the admin UI.
func ResolveAPIBaseURL(settingValue string) string {
	if u := strings.TrimSpace(settingValue); u != "" {
		return strings.TrimSuffix(u, "/")
	}
	return "http://localhost:8000"
}
