package verifier

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/smtp"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/pkg/config"
)

const (
	defaultSMTPMaxConcurrent = 25
	defaultSMTPVerifyTimeout = 135 * time.Second
	smtpDialTimeout          = 24 * time.Second
	smtpIODeadline           = 30 * time.Second
)

var smtpSem chan struct{}

// smtpDialPort is overridden in tests so probeSMTP can hit a fake MX.
var smtpDialPort = "25"

// resolvePublicSMTP returns dialable public MX IPs. Tests may replace it
// so the fake SMTP listener on 127.0.0.1 is reachable.
var resolvePublicSMTP = helper.PublicSMTPDialIPs

var smtpDial = net.DialTimeout

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
			d := time.Duration(parsed) * time.Second
			if d < defaultSMTPVerifyTimeout {
				return defaultSMTPVerifyTimeout
			}
			return d
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
	return VerifyEmailBounded(context.Background(), email, smtpVerifyTimeout())
}

// VerifyEmailBounded verifies an email with a hard wall-clock deadline and a global SMTP semaphore.
// Semaphore / rate-limit waits do not consume maxDuration; that clock starts after slots are acquired.
func VerifyEmailBounded(ctx context.Context, email string, maxDuration time.Duration) VerifyResult {
	if maxDuration <= 0 {
		maxDuration = smtpVerifyTimeout()
	}
	if ctx == nil {
		ctx = context.Background()
	}

	select {
	case smtpSem <- struct{}{}:
		defer func() { <-smtpSem }()
	case <-ctx.Done():
		return VerifyResult{
			Status:        "unknown",
			Score:         35,
			Reason:        "cancelled",
			DetailedError: "cancelled while waiting for SMTP concurrency slot",
		}
	}

	return verifyEmailInternal(ctx, email, maxDuration)
}

func verifyEmailInternal(ctx context.Context, email string, maxDuration time.Duration) VerifyResult {
	funcStart := time.Now()
	email = strings.TrimSpace(strings.ToLower(email))

	result := VerifyResult{
		Status:      "unknown",
		SyntaxValid: false,
		Deliverable: false,
		CatchAll:    false,
		Score:       35,
	}

	if !helper.IsValidMailboxSyntax(email) {
		result.Status = "invalid"
		result.Score = 0
		result.Reason = "syntax"
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	at := strings.IndexByte(email, '@')
	user := email[:at]
	domain := email[at+1:]
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
		result.ProcessingTime = time.Since(funcStart).Seconds()
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
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	// Role account detection — expanded list (G13 fix, synced with worker)
	roles := []string{
		"admin", "support", "info", "contact", "sales", "help", "billing",
		"webmaster", "postmaster", "hostmaster", "jobs", "hr",
		// Extended role prefixes
		"noreply", "no-reply", "no_reply", "newsletter", "notifications",
		"bounce", "mailer-daemon", "abuse", "security", "marketing",
		"media", "office", "team", "hello", "press", "legal", "privacy",
		"unsubscribe", "donotreply", "do-not-reply",
	}
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
	mxRecords, aFallback, err := lookupMX(domain)
	if err != nil || len(mxRecords) == 0 {
		result.HasMX = false
		result.Status = "invalid"
		result.Score = 0
		result.Reason = "mx"
		result.DetailedError = "No MX or A records found"
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	// G10 Fix: RFC 7505 Null MX — MX record with priority 0 and host "."
	// explicitly signals "this domain does not accept email". Mark invalid immediately.
	if len(mxRecords) == 1 && mxRecords[0].Pref == 0 {
		host := strings.TrimSuffix(mxRecords[0].Host, ".")
		if host == "" || host == "." {
			result.Status = "invalid"
			result.Score = 0
			result.HasMX = false
			result.Reason = "no_mail"
			result.DetailedError = "RFC 7505 Null MX: domain explicitly rejects mail"
			result.ProcessingTime = time.Since(funcStart).Seconds()
			return result
		}
	}

	result.HasMX = !aFallback

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

	// Rate-limit wait does not consume the probe clock. Wait until a slot is
	// available or ctx is cancelled (client gone / shutdown).
	if err := WaitDomainRateLimit(ctx, domain, result.IsFree); err != nil {
		result.Status = "unknown"
		if ctx.Err() != nil {
			result.Reason = "cancelled"
			result.DetailedError = "cancelled while waiting for per-domain rate limit"
		} else {
			result.Reason = "rate_limit_timeout"
			result.DetailedError = "per-domain rate limit wait exceeded"
		}
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	// START THE VERIFICATION DEADLINE TIMER AFTER RATE-LIMIT & SEMAPHORE SLOTS ARE ACQUIRED
	verifyStart := time.Now()
	deadline := verifyStart.Add(maxDuration)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	defer func() {
		result.ProcessingTime = time.Since(verifyStart).Seconds()
	}()

	sawCatchAllInconclusive := false
	sawBlockedHost := false
	sawPublicDialAttempt := false

	// Try the best MX records (Limit to top 5)
	for i, mx := range mxRecords {
		if i >= 5 {
			break
		}
		if ctx.Err() != nil {
			result.Status = "unknown"
			result.Reason = "cancelled"
			result.DetailedError = "cancelled before SMTP probe"
			return result
		}
		if time.Now().After(deadline) {
			result.Status = "unknown"
			result.Reason = "timeout"
			result.DetailedError = "verification deadline exceeded"
			return result
		}
		host := strings.TrimSuffix(mx.Host, ".")

		res := probeSMTP(host, domain, email, deadline)
		if res.Blocked {
			sawBlockedHost = true
			continue
		}
		sawPublicDialAttempt = true
		if !res.Connected {
			continue
		}
		result.SMTPConnect = true
		status, score, reason, deliverable, catchAll, done, inconclusive := helper.SMTPProbeDisposition(
			res.Accepted, res.CatchAllResult, res.HardFail, res.MailboxFull, sawCatchAllInconclusive,
		)
		if inconclusive {
			sawCatchAllInconclusive = true
		}
		if !done {
			continue
		}
		result.Status = status
		result.Score = score
		result.Reason = reason
		result.Deliverable = deliverable
		result.CatchAll = catchAll
		if reason == "mailbox_full" {
			result.MailboxFull = true
		}
		return result
	}

	if sawCatchAllInconclusive {
		result.Status = "unknown"
		result.Score = 35
		result.Reason = "catchall_inconclusive"
		result.DetailedError = "target RCPT accepted but random probe was greylisted or dropped"
		return result
	}

	// Parked / web-only: no real MX, A-record dial never reached SMTP → undeliverable.
	if aFallback && !result.SMTPConnect {
		result.Status = "invalid"
		result.Score = 0
		result.HasMX = false
		result.Reason = "no_mail"
		result.DetailedError = "A-record fallback: SMTP unreachable (parked/web-only domain)"
		return result
	}

	if sawBlockedHost && !sawPublicDialAttempt {
		result.Status = "unknown"
		result.Score = 35
		result.Reason = "private_mx"
		result.DetailedError = "MX resolved only to private or blocked addresses"
		return result
	}

	result.Status = "unknown"
	result.Reason = "smtp"
	return result
}

type smtpProbe struct {
	Connected      bool
	Blocked        bool
	Accepted       bool
	CatchAll       bool
	CatchAllResult helper.CatchAllResult
	HardFail       bool
	MailboxFull    bool
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

	ips, err := resolvePublicSMTP(mxHost)
	if err != nil || len(ips) == 0 {
		if helper.IsBlockedSMTPHost(err) {
			res.Blocked = true
		}
		return res
	}

	var conn net.Conn
	for _, ip := range ips {
		conn, err = smtpDial("tcp", net.JoinHostPort(ip.String(), smtpDialPort), dialTimeout)
		if err == nil {
			break
		}
	}
	if conn == nil {
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

	err = client.Rcpt(fullEmail)
	if err == nil {
		res.Accepted = true
		res.CatchAllResult = probeCatchAll(client, domain)
		res.CatchAll = res.CatchAllResult == helper.CatchAllAccepted
		return res
	}

	res.HardFail, res.MailboxFull = helper.ClassifyTargetRCPT(err)
	return res
}

// probeCatchAll requires a clean RSET + MAIL + RCPT. Incomplete transactions
// are inconclusive — they must not be treated as "not catch-all".
func probeCatchAll(client *smtp.Client, domain string) helper.CatchAllResult {
	randomEmail := randomString(12) + "@" + domain
	if errR := client.Reset(); errR != nil {
		return helper.CatchAllInconclusive
	}
	if errM := client.Mail(""); errM != nil {
		return helper.CatchAllInconclusive
	}
	return helper.ClassifyCatchAllRCPT(client.Rcpt(randomEmail))
}
