package security

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"unicode"
)

// IsStrongPassword mirrors the Gin strong_password validator used at registration.
func IsStrongPassword(password string) bool {
	if len(password) < 8 {
		return false
	}
	var hasUpper, hasLower, hasDigit bool
	for _, ch := range password {
		switch {
		case unicode.IsUpper(ch):
			hasUpper = true
		case unicode.IsLower(ch):
			hasLower = true
		case unicode.IsDigit(ch):
			hasDigit = true
		}
	}
	return hasUpper && hasLower && hasDigit
}

// ValidateWebhookURL requires https and rejects loopback/private/link-local targets (SSRF guard).
// Empty url is allowed (clears webhook).
func ValidateWebhookURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("invalid webhook URL")
	}
	if !strings.EqualFold(u.Scheme, "https") {
		return errors.New("webhook URL must use https")
	}
	if u.Host == "" || u.User != nil {
		return errors.New("invalid webhook URL")
	}
	if u.Fragment != "" {
		return errors.New("invalid webhook URL")
	}

	host := u.Hostname()
	if host == "" {
		return errors.New("invalid webhook URL")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "metadata.google.internal" {
		return errors.New("webhook URL must not target private or local addresses")
	}

	// Literal IP in hostname
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return errors.New("webhook URL must not target private or local addresses")
		}
		return nil
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("webhook URL host could not be resolved")
	}
	if len(ips) == 0 {
		return errors.New("webhook URL host could not be resolved")
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return errors.New("webhook URL must not target private or local addresses")
		}
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
		return true
	}
	// AWS/GCP/Azure metadata commonly 169.254.169.254 (link-local — already covered)
	return false
}
