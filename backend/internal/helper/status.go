package helper

import "strings"

// NormalizeVerificationStatus canonicalizes email verification status strings.
// This ensures consistent handling of all aliases workers might send.
// Matches legacy PHP SmtpVerifier::normalizeVerificationStatus exactly.
func NormalizeVerificationStatus(status string) string {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch normalized {
	case "valid", "deliverable":
		return "valid"
	case "catch_all", "catch-all", "catchall":
		return "catch_all"
	case "unknown", "risky", "temp", "temporary", "mailbox_full", "mailbox-full":
		return "unknown"
	case "disposable":
		return "disposable"
	case "invalid", "undeliverable", "blacklist", "spam-trap", "spamtrap":
		return "invalid"
	default:
		return "unknown"
	}
}

// ScoreForStatus returns the verification score for a normalized status.
func ScoreForStatus(status string) int {
	switch NormalizeVerificationStatus(status) {
	case "valid":
		return 100
	case "catch_all":
		return 55
	case "unknown":
		return 35
	case "disposable":
		return 10
	default:
		return 0
	}
}
