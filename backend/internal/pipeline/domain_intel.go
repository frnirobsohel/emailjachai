package pipeline

import "strings"

// Domain policy type constants (match domains.type in DB).
const (
	PolicyFree       = "free"
	PolicyDisposable = "disposable"
	PolicySpamTrap   = "spam-trap"
	PolicyBlacklist  = "blacklist"
)

// LookupDomainPolicy walks parent domains (sub.a.com → a.com) against a policy map.
func LookupDomainPolicy(domain string, policies map[string]string) string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" || len(policies) == 0 {
		return ""
	}
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return ""
	}
	for i := 0; i <= len(parts)-2; i++ {
		candidate := strings.Join(parts[i:], ".")
		if t, ok := policies[candidate]; ok {
			return t
		}
	}
	return ""
}

// IsBlockingPolicy reports policies that should skip SMTP (resolved via domain intelligence).
func IsBlockingPolicy(policyType string) bool {
	switch policyType {
	case PolicyDisposable, PolicySpamTrap, PolicyBlacklist:
		return true
	default:
		return false
	}
}

// DomainIntelResult is a synthetic verification outcome from domain intelligence cache.
type DomainIntelResult struct {
	Status        string
	Score         int
	Reason        string
	IsDisposable  bool
	IsSpamTrap    bool
	IsBlacklisted bool
	IsFree        bool
}

// ResolveDomainIntel returns a result when the domain policy can short-circuit SMTP.
// Non-blocking policies (e.g. free) return ok=false so SMTP still runs.
func ResolveDomainIntel(email string, policies map[string]string) (DomainIntelResult, bool) {
	d := DomainOf(email)
	policy := LookupDomainPolicy(d, policies)
	if policy == "" && IsKnownFreeDomain(d) {
		// Free is informational only — still needs mailbox SMTP check.
		return DomainIntelResult{IsFree: true}, false
	}
	if !IsBlockingPolicy(policy) {
		if policy == PolicyFree {
			return DomainIntelResult{IsFree: true}, false
		}
		return DomainIntelResult{}, false
	}

	switch policy {
	case PolicyDisposable:
		return DomainIntelResult{
			Status:       "disposable",
			Score:        10,
			Reason:       "disposable",
			IsDisposable: true,
		}, true
	case PolicySpamTrap:
		return DomainIntelResult{
			Status:     "invalid",
			Score:      0,
			Reason:     "spamtrap",
			IsSpamTrap: true,
		}, true
	case PolicyBlacklist:
		return DomainIntelResult{
			Status:        "invalid",
			Score:         0,
			Reason:        "blacklist",
			IsBlacklisted: true,
		}, true
	default:
		return DomainIntelResult{}, false
	}
}

// UniqueDomains extracts unique domains from an email list.
func UniqueDomains(emails []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, email := range emails {
		d := DomainOf(email)
		if d == "" {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
		// Also collect parent domains for IN-query coverage
		parts := strings.Split(d, ".")
		for i := 1; i <= len(parts)-2; i++ {
			parent := strings.Join(parts[i:], ".")
			if _, ok := seen[parent]; ok {
				continue
			}
			seen[parent] = struct{}{}
			out = append(out, parent)
		}
	}
	return out
}
