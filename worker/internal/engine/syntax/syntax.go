package syntax

import (
	"strings"
)

// Result holds the parsed components and validity details of an email address.
type Result struct {
	Email      string
	LocalPart  string
	DomainPart string
	IsValid    bool
	Reason     string
}

// Validate checks if the given email has a valid syntax and returns a detailed Result.
func Validate(email string) Result {
	raw := strings.TrimSpace(email)
	normalized := strings.ToLower(raw)

	if len(normalized) < 6 {
		return Result{Email: normalized, IsValid: false, Reason: "address_too_short"}
	}
	if len(normalized) > 254 {
		return Result{Email: normalized, IsValid: false, Reason: "address_too_long"}
	}

	at := strings.IndexByte(normalized, '@')
	if at < 1 {
		return Result{Email: normalized, IsValid: false, Reason: "missing_or_leading_at"}
	}
	if at != strings.LastIndexByte(normalized, '@') {
		return Result{Email: normalized, IsValid: false, Reason: "multiple_at_symbols"}
	}

	local := normalized[:at]
	domain := normalized[at+1:]

	if len(local) == 0 || len(local) > 64 {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "invalid_local_length"}
	}
	if len(domain) < 4 || len(domain) > 253 {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "invalid_domain_length"}
	}

	// Consecutive dots check
	if strings.Contains(local, "..") || strings.Contains(domain, "..") {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "consecutive_dots"}
	}

	// Leading/trailing dot or hyphen
	if local[0] == '.' || local[len(local)-1] == '.' {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "leading_or_trailing_dot_in_local"}
	}
	if domain[0] == '.' || domain[len(domain)-1] == '.' || domain[0] == '-' || domain[len(domain)-1] == '-' {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "invalid_domain_boundary"}
	}

	// TLD check (must have at least one dot, and TLD must be >= 2 characters)
	dot := strings.LastIndexByte(domain, '.')
	if dot < 1 || dot >= len(domain)-2 {
		return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "invalid_tld"}
	}

	// Check local runes
	for _, r := range local {
		if !isMailboxLocalRune(r) {
			return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "illegal_local_character"}
		}
	}

	// Check domain runes and label lengths
	labels := strings.Split(domain, ".")
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 {
			return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "invalid_domain_label"}
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "hyphen_at_label_boundary"}
		}
		for _, r := range label {
			if !isMailboxDomainRune(r) {
				return Result{Email: normalized, LocalPart: local, DomainPart: domain, IsValid: false, Reason: "illegal_domain_character"}
			}
		}
	}

	return Result{
		Email:      normalized,
		LocalPart:  local,
		DomainPart: domain,
		IsValid:    true,
		Reason:     "valid",
	}
}

// IsValid is a quick boolean check matching standard verification rules.
func IsValid(email string) bool {
	return Validate(email).IsValid
}

func isMailboxLocalRune(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') ||
		r == '.' || r == '_' || r == '%' || r == '+' || r == '-'
}

func isMailboxDomainRune(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-'
}
