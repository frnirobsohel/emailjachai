package engine

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

	"github.com/patrickmn/go-cache"
)

const (
	defaultSMTPVerifyTimeout = 135 * time.Second
	smtpDialTimeout          = 24 * time.Second
	smtpIODeadline           = 30 * time.Second
)

var smtpDialPort = "25"

var resolvePublicSMTP = PublicSMTPDialIPs

var smtpDial = net.DialTimeout

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

// MXCache stores MX lookup results for fast local retrieval (TTL: 1 hour)
var MXCache = cache.New(1*time.Hour, 2*time.Hour)

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

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		result.Status = "invalid"
		result.Score = 0
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

	user := parts[0]
	domain := parts[1]
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

	// Basic Role detection
	roles := []string{"admin", "support", "info", "contact", "sales", "help", "billing", "webmaster", "postmaster", "hostmaster", "jobs", "hr"}
	for _, r := range roles {
		if user == r {
			result.IsRole = true
			break
		}
	}

	// Lookup MX Records with In-Memory Caching
	var mxRecords []*net.MX
	var err error
	if cachedMX, found := MXCache.Get(domain); found {
		mxRecords = cachedMX.([]*net.MX)
		result.HasMX = len(mxRecords) > 0
	} else {
		mxRecords, err = net.LookupMX(domain)
		if err != nil || len(mxRecords) == 0 {
			_, errA := net.LookupHost(domain)
			if errA != nil {
				MXCache.Set(domain, []*net.MX{}, cache.DefaultExpiration)
				result.Status = "invalid"
				result.Reason = "mx"
				result.ProcessingTime = time.Since(funcStart).Seconds()
				return result
			}
			result.HasMX = true
			mxRecords = []*net.MX{{Host: domain, Pref: 10}}
		} else {
			result.HasMX = true
		}
		// Save to cache
		MXCache.Set(domain, mxRecords, cache.DefaultExpiration)
	}

	if len(mxRecords) == 0 {
		result.Status = "invalid"
		result.Reason = "mx"
		result.ProcessingTime = time.Since(funcStart).Seconds()
		return result
	}

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

	// Rate-limit wait does not consume the 135s probe clock. Wait until a slot
	// is available or the parent ctx (chunk budget / shutdown) is cancelled.
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
			continue
		}
		sawPublicDialAttempt = true
		if !res.Connected {
			continue
		}
		result.SMTPConnect = true
		status, score, reason, deliverable, catchAll, done, inconclusive := SMTPProbeDisposition(
			res.Accepted, res.CatchAllResult, res.HardFail, res.MailboxFull, sawCatchAllInconclusive,
		)
		if inconclusive {
			sawCatchAllInconclusive = true
		}
		if !done {
			if res.TempFail {
				result.Reason = "temp_fail"
			}
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
	CatchAllResult CatchAllResult
	HardFail       bool
	TempFail       bool
	MailboxFull    bool
}

func probeSMTP(mxHost, domain, fullEmail string, deadline time.Time) smtpProbe {
	res := smtpProbe{}
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker.local"
	} else if !strings.Contains(hostname, ".") {
		hostname = hostname + ".local"
	}

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
	// Legacy Parity: Use Null Sender (<>) for verification probes
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
