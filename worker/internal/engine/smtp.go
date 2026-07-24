package engine

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/smtp"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/patrickmn/go-cache"
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
	Reason         string
}

// DomainCache stores domain policies fetched from API
type DomainCache struct {
	mu        sync.RWMutex
	domains   map[string]string // domain -> type
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
	defer func() {
		result.ProcessingTime = time.Since(start).Seconds()
	}()

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		result.Status = "invalid"
		result.Score = 0
		return result
	}

	user := strings.ToLower(parts[0])
	domain := strings.ToLower(parts[1])
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
					result.CatchAll = true
					result.Score = 55
					result.Reason = "catch_all"
					return result
				}
				result.Status = "valid"
				result.Score = 100
				result.Deliverable = true
				result.Reason = "accepted"
				return result
			}
			if res.MailboxFull {
				result.MailboxFull = true
				result.Status = "unknown"
				result.Reason = "mailbox_full"
				return result
			}
			if res.HardFail {
				result.Status = "invalid"
				result.Score = 0
				result.Reason = "rejected"
				return result
			}
			if res.TempFail {
				result.Reason = "temp_fail"
			}
		}
	}

	result.Status = "unknown"
	result.Reason = "smtp"
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

func probeSMTP(mxHost, domain, fullEmail string) smtpProbe {
	res := smtpProbe{}
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker.local"
	} else if !strings.Contains(hostname, ".") {
		hostname = hostname + ".local"
	}

	conn, err := net.DialTimeout("tcp", mxHost+":25", 8*time.Second)
	if err != nil { return res }
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return res
	}

	res.Connected = true
	client, err := smtp.NewClient(conn, mxHost)
	if err != nil { return res }
	defer func() {
		_ = conn.SetDeadline(time.Now().Add(1 * time.Second))
		_ = client.Quit()
		_ = client.Close()
	}()

	if err = client.Hello(hostname); err != nil { return res }
	// Legacy Parity: Use Null Sender (<>) for verification probes
	if err = client.Mail(""); err != nil { return res }

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
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "550") || strings.Contains(errMsg, "551") || strings.Contains(errMsg, "553") {
			res.HardFail = true
		} else if strings.Contains(errMsg, "552") || strings.Contains(errMsg, "storage limit") || strings.Contains(errMsg, "over quota") {
			res.MailboxFull = true
			res.TempFail = true
		} else {
			res.TempFail = true
		}
	}
	return res
}
