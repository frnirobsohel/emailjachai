package engine

import "strings"

// IsValidMailboxSyntax mirrors backend/internal/helper.IsValidMailboxSyntax.
// Worker is a separate module; keep rules identical so bulk accept and SMTP agree.
func IsValidMailboxSyntax(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) < 6 || len(email) > 254 {
		return false
	}
	at := strings.IndexByte(email, '@')
	if at < 1 || at != strings.LastIndexByte(email, '@') {
		return false
	}
	local, domain := email[:at], email[at+1:]
	if len(local) == 0 || len(local) > 64 || len(domain) < 4 {
		return false
	}
	if strings.Contains(local, "..") || strings.Contains(domain, "..") {
		return false
	}
	if local[0] == '.' || local[len(local)-1] == '.' {
		return false
	}
	if domain[0] == '.' || domain[len(domain)-1] == '.' || domain[0] == '-' || domain[len(domain)-1] == '-' {
		return false
	}
	dot := strings.LastIndexByte(domain, '.')
	if dot < 1 || dot >= len(domain)-2 {
		return false
	}
	for _, r := range local {
		if !isMailboxLocalRune(r) {
			return false
		}
	}
	for _, r := range domain {
		if !isMailboxDomainRune(r) {
			return false
		}
	}
	return true
}

func isMailboxLocalRune(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') ||
		r == '.' || r == '_' || r == '%' || r == '+' || r == '-'
}

func isMailboxDomainRune(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '-'
}
