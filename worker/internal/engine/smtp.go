package engine

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"net"
	"net/smtp"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"ejp-worker/internal/egress"
	"ejp-worker/internal/scheduler"

	"github.com/patrickmn/go-cache"
)

const (
	defaultSMTPVerifyTimeout = 135 * time.Second
	smtpDialTimeout          = 24 * time.Second
	smtpIODeadline           = 30 * time.Second
)

var smtpDialPort = "25"

var resolvePublicSMTP = PublicSMTPDialIPs

var smtpDial = egress.DefaultPool.Dial

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
	Reason         string
}

// DomainCache stores domain policies fetched from API
type DomainCache struct {
	mu      sync.RWMutex
	domains map[string]string // domain -> type
}

var Cache = &DomainCache{
	domains: make(map[string]string),
}

// MXCache stores successful MX lookup results for fast local retrieval (TTL: 1 hour).
// Empty / failure answers are never stored (see lookupWorkerMX).
var MXCache = cache.New(1*time.Hour, 2*time.Hour)

type mxCacheValue struct {
	Records   []*net.MX
	AFallback bool
}

// Overridable in tests — production uses net.LookupMX / net.LookupHost.
var lookupMXFn = net.LookupMX
var lookupHostFn = net.LookupHost

func isTemporaryDNSError(err error) bool {
	if err == nil {
		return false
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return dnsErr.Temporary()
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "temporary") ||
		strings.Contains(msg, "server misbehaving")
}

// lookupWorkerMX returns MX records (or A-record fallback). Failures are not cached.
// temporary is true when the failure looks like a resolver blip (caller should use unknown, not invalid).
// aFallback is true when only an A-record stand-in was used (no real MX — parked/web-only domains).
func lookupWorkerMX(domain string) (records []*net.MX, aFallback bool, temporary bool, err error) {
	if cachedMX, found := MXCache.Get(domain); found {
		switch v := cachedMX.(type) {
		case mxCacheValue:
			if len(v.Records) == 0 {
				MXCache.Delete(domain)
			} else {
				return v.Records, v.AFallback, false, nil
			}
		case []*net.MX:
			if len(v) == 0 {
				// Legacy poison from older builds that cached DNS failures as empty.
				MXCache.Delete(domain)
			} else {
				return v, false, false, nil
			}
		default:
			MXCache.Delete(domain)
		}
	}

	mxRecords, mxErr := lookupMXFn(domain)
	if mxErr == nil && len(mxRecords) > 0 {
		MXCache.Set(domain, mxCacheValue{Records: mxRecords, AFallback: false}, cache.DefaultExpiration)
		return mxRecords, false, false, nil
	}

	_, errA := lookupHostFn(domain)
	if errA == nil {
		fallback := []*net.MX{{Host: domain, Pref: 10}}
		MXCache.Set(domain, mxCacheValue{Records: fallback, AFallback: true}, cache.DefaultExpiration)
		return fallback, true, false, nil
	}

	temp := isTemporaryDNSError(mxErr) || isTemporaryDNSError(errA)
	if mxErr != nil {
		return nil, false, temp, mxErr
	}
	return nil, false, temp, errA
}

func (c *DomainCache) Update(data []map[string]interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	newDomains := make(map[string]string)
	for _, item := range data {
		domain, ok1 := item["domain"].(string)
		dType, ok2 := item["type"].(string)
		excluded, _ := item["excluded"].(float64)

		if ok1 && ok2 && excluded == 0 {
			newDomains[strings.ToLower(domain)] = dType
		}
	}
	c.domains = newDomains
}

func (c *DomainCache) GetPolicy(domain string) (isFree, isDisposable, isSpamTrap, isBlacklisted bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return
	}

	for i := 0; i <= len(parts)-2; i++ {
		candidate := strings.Join(parts[i:], ".")
		if dType, ok := c.domains[candidate]; ok {
			switch dType {
			case "free":
				isFree = true
			case "disposable":
				isDisposable = true
			case "spam-trap":
				isSpamTrap = true
			case "blacklist":
				isBlacklisted = true
			}
			return
		}
	}
	return
}

func randomString(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// isKnownAcceptAllProvider detects M365/Yahoo-style MX hosts. Used only for
// tests / future optional policy — verification status must NOT be forced from
// this list; catch-all comes solely from the random RCPT probe (industry default).
func isKnownAcceptAllProvider(mxHost string) bool {
	host := strings.ToLower(strings.TrimSuffix(mxHost, "."))
	acceptAllSuffixes := []string{
		"protection.outlook.com",  // Microsoft 365 / Exchange Online
		"mail.protection.outlook.com",
		"olc.protection.outlook.com",
		"eo.outlook.com",
		"yahoodns.net",            // Yahoo Mail infrastructure
		"yahoo.com",
		"ymail.com",
	}
	for _, suffix := range acceptAllSuffixes {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func VerifyEmail(ctx context.Context, email string) VerifyResult {
	if ctx == nil {
		ctx = context.Background()
	}
	funcStart := time.Now()
	email = strings.ToLower(strings.TrimSpace(email))

	result := VerifyResult{
		Status:      "unknown",
		SyntaxValid: false,
		Deliverable: false,
		CatchAll:    false,
		Score:       35,
	}

	if !IsValidMailboxSyntax(email) {
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

	// Check domain policy
	isFree, isDisposable, isSpamTrap, isBlacklisted := Cache.GetPolicy(domain)
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

	// Role account detection — expanded list (G13 fix)
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

	// Lookup MX with in-memory cache. Only successful (non-empty) answers are cached —
	// resolver blips must not poison a domain as "no MX" for an hour.
	mxRecords, aFallback, dnsTemporary, err := lookupWorkerMX(domain)
	if err != nil || len(mxRecords) == 0 {
		result.HasMX = false
		if dnsTemporary {
			result.Status = "unknown"
			result.Reason = "dns_temp"
			result.DetailedError = "temporary DNS failure"
		} else {
			result.Status = "invalid"
			result.Reason = "mx"
		}
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

	// Rate-limit waits do not consume the 135s probe clock.
	// 1) Per-VPS connection/min (Admin → Server rate_limit) — additive brake only.
	// 2) Per-domain RPS — MX politeness (unchanged).
	if err := WaitWorkerRateLimit(ctx); err != nil {
		result.Status = "unknown"
		if ctx.Err() != nil {
			result.Reason = "cancelled"
			result.DetailedError = "cancelled while waiting for worker rate limit"
		} else {
			result.Reason = "rate_limit_timeout"
			result.DetailedError = "worker rate limit wait exceeded"
		}
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}
	if err := scheduler.WaitDomainSchedule(ctx, domain, result.IsFree, WaitDomainRateLimit); err != nil {
		result.Status = "unknown"
		if ctx.Err() != nil {
			result.Reason = "cancelled"
			result.DetailedError = "cancelled while waiting for per-domain rate limit"
		} else if errors.Is(err, scheduler.ErrDomainInCooldown) {
			result.Reason = "temp_fail"
			result.DetailedError = "domain is cooling down due to cluster greylisting/tarpit"
		} else {
			result.Reason = "rate_limit_timeout"
			result.DetailedError = "per-domain rate limit wait exceeded"
		}
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	// START THE VERIFICATION DEADLINE TIMER AFTER RATE-LIMIT SLOT IS ACQUIRED
	verifyStart := time.Now()
	deadline := verifyStart.Add(smtpVerifyTimeout())
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	defer func() {
		result.ProcessingTime = time.Since(verifyStart).Seconds()
	}()

	sawCatchAllInconclusive := false
	sawBlockedHost := false
	sawPublicDialAttempt := false

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
			scheduler.RecordOutcome(domain, scheduler.OutcomeBlocked)
			continue
		}
		sawPublicDialAttempt = true
		if !res.Connected {
			continue
		}
		result.SMTPConnect = true

		// Catch-all only from random RCPT probe (SMTPProbeDisposition) — same as
		// standard verifiers. Do not force catch_all by MX vendor (M365/Yahoo).
		status, score, reason, deliverable, catchAll, done, inconclusive := SMTPProbeDisposition(
			res.Accepted, res.CatchAllResult, res.HardFail, res.MailboxFull, sawCatchAllInconclusive,
		)
		if inconclusive {
			sawCatchAllInconclusive = true
		}
		if !done {
			// G9 Fix: 4xx temp fail (greylist / 421 / 450 / 451) — retry once
			// on the same MX after a short back-off, if deadline allows.
			if res.TempFail {
				scheduler.RecordOutcome(domain, scheduler.OutcomeTempFail)
				result.Reason = "temp_fail"
				const greylistBackoff = 8 * time.Second
				if time.Until(deadline) > greylistBackoff+smtpDialTimeout {
					time.Sleep(greylistBackoff)
					res2 := probeSMTP(host, domain, email, deadline)
					if res2.Connected {
						result.SMTPConnect = true
						status2, score2, reason2, deliverable2, catchAll2, done2, inconclusive2 := SMTPProbeDisposition(
							res2.Accepted, res2.CatchAllResult, res2.HardFail, res2.MailboxFull, sawCatchAllInconclusive,
						)
						if inconclusive2 {
							sawCatchAllInconclusive = true
						}
						if done2 {
							scheduler.RecordOutcome(domain, scheduler.OutcomeSuccess)
							result.Status = status2
							result.Score = score2
							result.Reason = reason2
							result.Deliverable = deliverable2
							result.CatchAll = catchAll2
							if reason2 == "mailbox_full" {
								result.MailboxFull = true
							}
							return result
						}
					}
				}
			}
			continue
		}
		scheduler.RecordOutcome(domain, scheduler.OutcomeSuccess)
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

	// Split the old blanket "smtp" reason so exports show whose side failed.
	result.Status = "unknown"
	result.Score = 35
	if result.SMTPConnect {
		if result.Reason == "temp_fail" {
			result.DetailedError = "MX returned temporary failure / greylist after retry"
			return result
		}
		result.Reason = "smtp_inconclusive"
		result.DetailedError = "SMTP connected but no definitive RCPT verdict"
		return result
	}
	result.Reason = "smtp_unreachable"
	result.DetailedError = "could not complete SMTP connection to any MX"
	return result
}

type smtpProbe struct {
	Connected      bool
	Blocked        bool
	Accepted       bool
	CatchAll       bool
	CatchAllResult CatchAllResult
	HardFail       bool
	TempFail       bool
	MailboxFull    bool
}

// smtpHELOHostname returns the HELO/EHLO hostname for outgoing SMTP probes.
// Priority: SMTP_HELO_HOSTNAME env var → OS hostname (with .fqdn suffix) → worker.mailverify.local
func smtpHELOHostname() string {
	if v := strings.TrimSpace(os.Getenv("SMTP_HELO_HOSTNAME")); v != "" {
		return v
	}
	hn, _ := os.Hostname()
	hn = strings.TrimSpace(hn)
	if hn == "" {
		return "worker.mailverify.local"
	}
	if !strings.Contains(hn, ".") {
		return hn + ".mailverify.local"
	}
	return hn
}

func probeSMTP(mxHost, domain, fullEmail string, deadline time.Time) smtpProbe {
	res := smtpProbe{}
	hostname := smtpHELOHostname()

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
		if IsBlockedSMTPHost(err) {
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
	if err := conn.SetDeadline(ioDeadline); err != nil {
		return res
	}

	res.Connected = true
	client, err := smtp.NewClient(conn, mxHost)
	if err != nil {
		return res
	}
	defer func() {
		_ = conn.SetDeadline(time.Now().Add(1 * time.Second))
		_ = client.Quit()
		_ = client.Close()
	}()

	if err = client.Hello(hostname); err != nil {
		return res
	}

	// G6 Fix: Attempt STARTTLS upgrade. Many MX servers (M365, Yahoo, Postfix)
	// require or strongly prefer TLS before accepting RCPT commands.
	// We try — if the server doesn't advertise STARTTLS or TLS fails, continue plain.
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsCfg := &tls.Config{
			ServerName:         mxHost,
			InsecureSkipVerify: false, //nolint:gosec // MX certs are often self-signed; skip on error below
		}
		if err := client.StartTLS(tlsCfg); err != nil {
			// TLS negotiation failed — fall back to plain and continue.
			// Some servers advertise STARTTLS but have bad certs; we still want a probe result.
			_ = err
		}
	}

	// Use Null Sender (<>) for verification probes (RFC 5321 compliant)
	if err = client.Mail(""); err != nil {
		return res
	}

	err = client.Rcpt(fullEmail)
	if err == nil {
		res.Accepted = true
		res.CatchAllResult = probeCatchAll(client, domain)
		res.CatchAll = res.CatchAllResult == CatchAllAccepted
		return res
	}

	res.HardFail, res.MailboxFull = ClassifyTargetRCPT(err)
	if res.MailboxFull {
		res.TempFail = true
	} else if !res.HardFail {
		res.TempFail = true
	}
	return res
}


func probeCatchAll(client *smtp.Client, domain string) CatchAllResult {
	randomEmail := randomString(12) + "@" + domain
	if errR := client.Reset(); errR != nil {
		return CatchAllInconclusive
	}
	if errM := client.Mail(""); errM != nil {
		return CatchAllInconclusive
	}
	return ClassifyCatchAllRCPT(client.Rcpt(randomEmail))
}
