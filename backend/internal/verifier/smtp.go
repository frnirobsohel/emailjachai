package verifier

import (
	"crypto/rand"
	"ejp-backend/pkg/config"
	"encoding/hex"
	"net"
	"net/smtp"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

type VerifyResult struct {
	Status         string // "valid", "invalid", "catch_all", "unknown", "disposable"
	Score          int
	Deliverable    bool
	CatchAll       bool
	MailboxFull    bool
	SyntaxValid    bool
	SMTPConnect    bool
	HasMX          bool
	MxRecords      []string
	IsFree         bool
	IsRole         bool
	IsSpamTrap     bool
	IsBlacklisted  bool
	ProcessingTime float64
	DetailedError  string
	Reason         string // syntax, mx, smtp, etc.
}

type domainPolicyEntry struct {
	isFree        bool
	isDisposable  bool
	isSpamTrap    bool
	isBlacklisted bool
	expiresAt     time.Time
}

var domainPolicyCache sync.Map

func randomString(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func checkDomainPolicy(domain string) (isFree, isDisposable, isSpamTrap, isBlacklisted bool) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if val, found := domainPolicyCache.Load(domain); found {
		entry := val.(domainPolicyEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.isFree, entry.isDisposable, entry.isSpamTrap, entry.isBlacklisted
		}
	}

	defer func() {
		domainPolicyCache.Store(domain, domainPolicyEntry{
			isFree:        isFree,
			isDisposable:  isDisposable,
			isSpamTrap:    isSpamTrap,
			isBlacklisted: isBlacklisted,
			expiresAt:     time.Now().Add(10 * time.Minute),
		})
	}()

	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return
	}

	// Loop through domain parts to handle subdomains (e.g., sub.example.com -> example.com)
	for i := 0; i <= len(parts)-2; i++ {
		candidate := strings.Join(parts[i:], ".")

		var domainPolicy struct {
			Type string
		}

		err := config.DB.Table("domains").
			Select("type").
			Where("domain = ? AND excluded = ?", candidate, false).
			First(&domainPolicy).Error

		if err == nil {
			switch domainPolicy.Type {
			case "free":
				isFree = true
			case "disposable":
				isDisposable = true
			case "spam-trap":
				isSpamTrap = true
			case "blacklist":
				isBlacklisted = true
			}
			// If we found a match, we stop and return the policy for this domain/subdomain
			return
		}
	}
	return
}

func VerifyEmail(email string) VerifyResult {
	start := time.Now()
	email = strings.TrimSpace(email)

	result := VerifyResult{
		Status:      "unknown",
		SyntaxValid: false,
		Deliverable: false,
		CatchAll:    false,
		Score:       35,
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		result.Status = "invalid"
		result.Score = 0
		return result
	}

	user := strings.ToLower(parts[0])
	domain := strings.ToLower(parts[1])
	result.SyntaxValid = true

	// Check domain policy (Spam Trap, Blacklist, Free, Disposable)
	isFree, isDisposable, isSpamTrap, isBlacklisted := checkDomainPolicy(domain)
	result.IsFree = isFree
	result.IsSpamTrap = isSpamTrap
	result.IsBlacklisted = isBlacklisted

	if isDisposable {
		result.Status = "disposable"
		result.Score = 10
		result.Reason = "disposable"
		result.ProcessingTime = time.Since(start).Seconds()
		return result
	}

	if isSpamTrap || isBlacklisted {
		result.Status = "invalid"
		result.Score = 0
		if isSpamTrap {
			result.Reason = "spamtrap"
		} else {
			result.Reason = "blacklist"
		}
		result.ProcessingTime = time.Since(start).Seconds()
		return result
	}

	// Basic Role detection (Sync with legacy list)
	roles := []string{"admin", "support", "info", "contact", "sales", "help", "billing", "webmaster", "postmaster", "hostmaster", "jobs", "hr"}
	for _, r := range roles {
		if user == r {
			result.IsRole = true
			break
		}
	}

	// Basic Free email detection
	freeDomains := []string{"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"}
	for _, d := range freeDomains {
		if domain == d {
			result.IsFree = true
			break
		}
	}

	// Lookup MX Records using advanced miekg/dns resolver
	mxRecords, err := lookupMX(domain)
	if err != nil || len(mxRecords) == 0 {
		result.HasMX = false
		result.Status = "invalid"
		result.Score = 0
		result.Reason = "mx"
		result.DetailedError = "No MX or A records found"
		result.ProcessingTime = time.Since(start).Seconds()
		return result
	}
	result.HasMX = true

	// Sort MX Records by Preference, then alphabetically by Host
	sort.Slice(mxRecords, func(i, j int) bool {
		if mxRecords[i].Pref == mxRecords[j].Pref {
			return mxRecords[i].Host < mxRecords[j].Host
		}
		return mxRecords[i].Pref < mxRecords[j].Pref
	})

	var mxList []string
	for _, mx := range mxRecords {
		mxList = append(mxList, strings.TrimSuffix(mx.Host, "."))
	}
	result.MxRecords = mxList

	// Try the best MX records (Limit to top 5)
	for i, mx := range mxRecords {
		if i >= 5 {
			break
		}
		host := strings.TrimSuffix(mx.Host, ".")

		res := probeSMTP(host, domain, email)
		if res.Connected {
			result.SMTPConnect = true
			if res.Accepted {
				if res.CatchAll {
					result.Status = "catch_all"
					result.Score = 55
					result.CatchAll = true
					result.Reason = "catch_all"
					result.ProcessingTime = time.Since(start).Seconds()
					return result
				}
				result.Status = "valid"
				result.Score = 100
				result.Deliverable = true
				result.ProcessingTime = time.Since(start).Seconds()
				return result
			}

			if res.HardFail {
				result.Status = "invalid"
				result.Score = 0
				result.Reason = "rejected"
				result.ProcessingTime = time.Since(start).Seconds()
				return result
			}

			if res.MailboxFull {
				result.Status = "unknown"
				result.MailboxFull = true
				result.Reason = "mailbox_full"
				result.ProcessingTime = time.Since(start).Seconds()
				return result
			}

			// TempFail = IP blocked / policy rejection — try next MX
			if res.TempFail {
				result.Reason = "ip_blocked"
				continue
			}
		}
	}

	result.Status = "unknown"
	result.Reason = "smtp"
	result.ProcessingTime = time.Since(start).Seconds()
	return result
}

type smtpProbe struct {
	Connected   bool
	Accepted    bool
	CatchAll    bool
	HardFail    bool
	TempFail    bool
	MailboxFull bool
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "verifier.local"
	}
	if !strings.Contains(hostname, ".") {
		return hostname + ".local"
	}
	return hostname
}

func probeSMTP(mxHost, domain, fullEmail string) smtpProbe {
	res := smtpProbe{}
	hostname := getHostname()

	// Setup timeout
	conn, err := net.DialTimeout("tcp", mxHost+":25", 8*time.Second)
	if err != nil {
		return res
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(10 * time.Second))
	res.Connected = true

	client, err := smtp.NewClient(conn, mxHost)
	if err != nil {
		return res
	}
	defer client.Close()
	defer client.Quit()

	if err = client.Hello(hostname); err != nil {
		return res
	}

	// Legacy uses null sender to reduce block rate
	if err = client.Mail(""); err != nil {
		return res
	}

	// Test actual email
	err = client.Rcpt(fullEmail)
	if err == nil {
		res.Accepted = true

		// Catch-all probe: send a random impossible email to detect catch-all domains
		randomEmail := "probe_" + randomString(8) + "@" + domain
		errCatch := client.Rcpt(randomEmail)
		if errCatch == nil {
			// Random email accepted → definite catch-all
			res.CatchAll = true
		} else {
			errStr := strings.ToLower(errCatch.Error())
			// 550 5.1.1 / 5.1.0 = user not found → NOT catch-all, original email is truly valid
			// 550 5.7.1 / 5.7.0 = IP/policy block → treat as catch-all (can't confirm)
			// Any other error (timeout, 4xx, reset) → treat as catch-all (can't confirm)
			isUserNotFound := (strings.Contains(errStr, "5.1.1") || strings.Contains(errStr, "5.1.0") ||
				strings.Contains(errStr, "user unknown") || strings.Contains(errStr, "no such user") ||
				strings.Contains(errStr, "does not exist") || strings.Contains(errStr, "invalid address"))
			if !isUserNotFound {
				res.CatchAll = true
			}
		}
	} else {
		errStr := strings.ToLower(err.Error())
		// 550 5.7.1 = IP blocked / policy → NOT a user rejection → TempFail (unknown)
		// 550 5.1.1 = user not found → HardFail (invalid)
		isIPBlock := strings.Contains(errStr, "5.7.1") || strings.Contains(errStr, "5.7.0") ||
			strings.Contains(errStr, "blocked") || strings.Contains(errStr, "blacklist") ||
			strings.Contains(errStr, "service unavailable") || strings.Contains(errStr, "access denied")
		if isIPBlock {
			// IP/policy block — we cannot determine if the user exists
			res.TempFail = true
		} else if strings.Contains(errStr, "550") || strings.Contains(errStr, "551") || strings.Contains(errStr, "553") {
			res.HardFail = true
		} else if strings.Contains(errStr, "552") {
			res.MailboxFull = true
		} else if strings.HasPrefix(errStr, "4") {
			res.TempFail = true
		}
	}

	return res
}



