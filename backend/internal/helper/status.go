package helper

import "strings"

// NormalizeVerificationStatus canonicalizes email verification status strings.
// mailbox_full is valid: the address exists, the mailbox is only over quota.
func NormalizeVerificationStatus(status string) string {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch normalized {
	case "valid", "deliverable", "mailbox_full", "mailbox-full":
		return "valid"
	case "catch_all", "catch-all", "catchall":
		return "catch_all"
	case "unknown", "risky", "temp", "temporary":
		return "unknown"
	case "disposable":
		return "disposable"
	case "invalid", "undeliverable", "blacklist", "spam-trap", "spamtrap":
		return "invalid"
	default:
		return "unknown"
	}
}

// PromoteMailboxFullToValid upgrades unknown/mailbox_full results to valid
// when SMTP confirmed the mailbox exists but is over quota.
// Does not override invalid, disposable, or catch_all.
func PromoteMailboxFullToValid(status string, mailboxFull bool) string {
	n := NormalizeVerificationStatus(status)
	if mailboxFull && (n == "unknown" || n == "valid") {
		return "valid"
	}
	return n
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
