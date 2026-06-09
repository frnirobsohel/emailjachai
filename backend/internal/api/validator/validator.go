// Package validator registers custom validation rules on top of go-playground/validator.
// All custom tags are registered once via Init() and then available to Gin's binding.
//
// Usage in routes/api.go:
//
//	import "ejp-backend/internal/api/validator"
//	validator.Init()
//
// Usage in request structs:
//
//	Email    string `json:"email"    binding:"required,email,not_disposable"`
//	IP       string `json:"ip"       binding:"required,ipv4_or_ipv6"`
//	Domain   string `json:"domain"   binding:"required,valid_domain"`
//	Password string `json:"password" binding:"required,strong_password"`
//	Role     string `json:"role"     binding:"required,user_role"`
package validator

import (
	"net"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// disposableDomains is a fast lookup set of well-known disposable email providers.
// In production, this list is seeded from the database via SyncDisposableDomains().
var disposableDomains = map[string]struct{}{
	"mailinator.com":   {},
	"guerrillamail.com":{},
	"10minutemail.com": {},
	"tempmail.com":     {},
	"throwam.com":      {},
	"yopmail.com":      {},
	"sharklasers.com":  {},
	"guerrillamailblock.com": {},
	"grr.la":           {},
	"spam4.me":         {},
	"trashmail.com":    {},
	"trashmail.me":     {},
	"dispostable.com":  {},
	"mailnull.com":     {},
	"spamgourmet.com":  {},
	"spamgourmet.net":  {},
	"fakeinbox.com":    {},
	"maildrop.cc":      {},
	"getnada.com":      {},
	"discard.email":    {},
}

// validRoles defines the allowed user role values.
var validRoles = map[string]struct{}{
	"admin":    {},
	"reseller": {},
	"user":     {},
}

// Init registers all custom validators on Gin's default binding engine.
// Call this once during server bootstrap (before any routes are served).
func Init() {
	v, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return
	}

	// Register each custom tag — panic on registration failure (startup bug, not runtime).
	must(v.RegisterValidation("not_disposable", notDisposable))
	must(v.RegisterValidation("valid_domain", validDomain))
	must(v.RegisterValidation("ipv4_or_ipv6", ipv4OrIPv6))
	must(v.RegisterValidation("strong_password", strongPassword))
	must(v.RegisterValidation("user_role", userRole))
}

// SyncDisposableDomains replaces the in-memory disposable domain list with
// a fresh list pulled from the database (called by admin domain service).
func SyncDisposableDomains(domains []string) {
	fresh := make(map[string]struct{}, len(domains))
	for _, d := range domains {
		d = strings.ToLower(strings.TrimSpace(d))
		if d != "" {
			fresh[d] = struct{}{}
		}
	}
	disposableDomains = fresh
}

// IsDisposableDomain checks whether a domain is in the disposable list.
// Exported so service-layer code can reuse the same in-memory set.
func IsDisposableDomain(domain string) bool {
	_, found := disposableDomains[strings.ToLower(domain)]
	return found
}

// ─────────────────────────────────────────────
// Custom validator functions
// ─────────────────────────────────────────────

// notDisposable rejects email addresses whose domain is in the disposable list.
//
//	Tag: not_disposable
//	Example: binding:"required,email,not_disposable"
func notDisposable(fl validator.FieldLevel) bool {
	email := strings.ToLower(fl.Field().String())
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return false // malformed — let the built-in `email` tag catch this
	}
	return !IsDisposableDomain(parts[1])
}

// validDomain checks that a value is a properly formatted domain name.
// Rules: 3–253 chars, each label ≤ 63 chars, no leading/trailing hyphens,
// only [a-z0-9-] per label, at least two labels (e.g. example.com).
//
//	Tag: valid_domain
//	Example: binding:"required,valid_domain"
func validDomain(fl validator.FieldLevel) bool {
	domain := strings.ToLower(strings.TrimSpace(fl.Field().String()))
	if len(domain) < 3 || len(domain) > 253 {
		return false
	}
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 63 {
			return false
		}
		if part[0] == '-' || part[len(part)-1] == '-' {
			return false
		}
		for _, ch := range part {
			if !((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-') {
				return false
			}
		}
	}
	return true
}

// ipv4OrIPv6 validates that a value is a well-formed IPv4 or IPv6 address.
//
//	Tag: ipv4_or_ipv6
//	Example: binding:"required,ipv4_or_ipv6"
func ipv4OrIPv6(fl validator.FieldLevel) bool {
	return net.ParseIP(fl.Field().String()) != nil
}

// strongPassword enforces a minimum password policy:
//   - At least 8 characters
//   - Contains at least one uppercase letter
//   - Contains at least one lowercase letter
//   - Contains at least one digit
//
//	Tag: strong_password
//	Example: binding:"required,strong_password"
func strongPassword(fl validator.FieldLevel) bool {
	password := fl.Field().String()
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

// userRole validates that a role string is one of the allowed platform roles.
//
//	Tag: user_role
//	Example: binding:"required,user_role"
func userRole(fl validator.FieldLevel) bool {
	_, ok := validRoles[strings.ToLower(fl.Field().String())]
	return ok
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

func must(err error) {
	if err != nil {
		panic("validator registration failed: " + err.Error())
	}
}
