package verifier

import (
	"crypto/rand"
	"ejp-backend/pkg/config"
	"encoding/hex"
	"net"
	"net/smtp"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultSMTPMaxConcurrent = 25
	defaultSMTPVerifyTimeout = 45 * time.Second
	smtpDialTimeout          = 8 * time.Second
	smtpIODeadline           = 10 * time.Second
)

var smtpSem chan struct{}

func init() {
	n := defaultSMTPMaxConcurrent
	if v := strings.TrimSpace(os.Getenv("SMTP_MAX_CONCURRENT")); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			n = parsed
		}
	}
	smtpSem = make(chan struct{}, n)
}

func smtpVerifyTimeout() time.Duration {
	if v := strings.TrimSpace(os.Getenv("SMTP_VERIFY_TIMEOUT_SEC")); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			return time.Duration(parsed) * time.Second
		}
	}
	return defaultSMTPVerifyTimeout
}

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

// VerifyEmail runs a bounded SMTP verification (concurrency cap + overall deadline).
func VerifyEmail(email string) VerifyResult {
	return VerifyEmailBounded(email, smtpVerifyTimeout())
}

// VerifyEmailBounded verifies an email with a hard wall-clock deadline and a global SMTP semaphore.
func VerifyEmailBounded(email string, maxDuration time.Duration) VerifyResult {
	start := time.Now()
	if maxDuration <= 0 {
		maxDuration = defaultSMTPVerifyTimeout
	}
	deadline := start.Add(maxDuration)

	select {
	case smtpSem <- struct{}{}:
		defer func() { <-smtpSem }()
	case <-time.After(time.Until(deadline)):
		return VerifyResult{
			Status:         "unknown",
			Score:          35,
			Reason:         "busy",
			DetailedError:  "SMTP concurrency limit",
			ProcessingTime: time.Since(start).Seconds(),
		}
	}

	return verifyEmailInternal(email, start, deadline)
}

func verifyEmailInternal(email string, start time.Time, deadline time.Time) VerifyResult {
	email = strings.TrimSpace(strings.ToLower(email))

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
		result.ProcessingTime = time.Since(start).Seconds()
		return result
	}

	user := parts[0]
	domain := parts[1]
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

	if time.Now().After(deadline) {
		result.Reason = "timeout"
		result.DetailedError = "verification deadline exceeded"
		result.ProcessingTime = time.Since(start).Seconds()
		return result
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
		if time.Now().After(deadline) {
			result.Status = "unknown"
			result.Reason = "timeout"
			result.DetailedError = "verification deadline exceeded"
			result.ProcessingTime = time.Since(start).Seconds()
			return result
		}
		host := strings.TrimSuffix(mx.Host, ".")

		res := probeSMTP(host, domain, email, deadline)
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

func probeSMTP(mxHost, domain, fullEmail string, deadline time.Time) smtpProbe {
	res := smtpProbe{}
	hostname := getHostname()

	remaining := time.Until(deadline)
	if remaining <= 0 {
		return res
	}
	dialTimeout := smtpDialTimeout
	if remaining < dialTimeout {
		dialTimeout = remaining
	}

	conn, err := net.DialTimeout("tcp", mxHost+":25", dialTimeout)
	if err != nil {
		return res
	}
	defer conn.Close()

	ioDeadline := time.Now().Add(smtpIODeadline)
	if ioDeadline.After(deadline) {
		ioDeadline = deadline
	}
	_ = conn.SetDeadline(ioDeadline)
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

		// Probe for Catch-All (use clean RSET transaction and non-suspicious random string)
		randomEmail := randomString(12) + "@" + domain
		if errR := client.Reset(); errR == nil {
			if errM := client.Mail(""); errM == nil {
				if errC := client.Rcpt(randomEmail); errC == nil {
					res.CatchAll = true
				}
			}
		} else {
			if errC := client.Rcpt(randomEmail); errC == nil {
				res.CatchAll = true
			}
		}
	} else {
		errStr := err.Error()
		errMsg := strings.ToLower(errStr)
		if strings.Contains(errMsg, "550") || strings.Contains(errMsg, "551") || strings.Contains(errMsg, "553") {
			res.HardFail = true
		} else if strings.Contains(errMsg, "552") || strings.Contains(errMsg, "storage limit") || strings.Contains(errMsg, "over quota") {
			res.MailboxFull = true
		} else if strings.HasPrefix(errStr, "4") {
			// Explicitly handle 4xx as temporary failures (already handled by defaults but good to be explicit)
			res.HardFail = false
		}
	}

	return res
}
