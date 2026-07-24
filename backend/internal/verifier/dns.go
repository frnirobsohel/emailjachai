package verifier

import (
	"encoding/json"
	"math/rand"
	"net"
	"os"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"github.com/miekg/dns"
)

type MXCacheEntry struct {
	Host string `json:"host"`
	Pref uint16 `json:"pref"`
}

// resolvers is the list of DNS servers loaded from DNS_RESOLVERS env var.
// Defaults to Cloudflare + Google public DNS.
var resolvers []string

func init() {
	raw := os.Getenv("DNS_RESOLVERS")
	if raw == "" {
		raw = "1.1.1.1:53,8.8.8.8:53,8.8.4.4:53"
	}
	parts := strings.Split(raw, ",")
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			// Ensure host:port format — append :53 if no port specified
			if !strings.Contains(p, ":") {
				p = p + ":53"
			}
			resolvers = append(resolvers, p)
		}
	}
}

// pickResolver returns a random resolver from the pool for load-balancing.
func pickResolver() string {
	if len(resolvers) == 0 {
		return "1.1.1.1:53"
	}
	return resolvers[rand.Intn(len(resolvers))]
}

// lookupMX queries MX records for the given domain using miekg/dns.
// It retries across multiple resolvers on failure and falls back to A records
// for domains without explicit MX entries (RFC 5321 §5.1).
func lookupMX(domain string) ([]*net.MX, error) {
	// Ensure FQDN
	if !strings.HasSuffix(domain, ".") {
		domain = domain + "."
	}
	domainClean := strings.TrimSuffix(domain, ".")

	// 1. Check Redis Cache
	if config.Redis != nil {
		redisKey := "domain_cache:mx:" + domainClean
		if cachedData, err := config.Redis.Get(config.Ctx, redisKey).Result(); err == nil && cachedData != "" {
			var cachedRecords []MXCacheEntry
			if json.Unmarshal([]byte(cachedData), &cachedRecords) == nil && len(cachedRecords) > 0 {
				var mxRecords []*net.MX
				for _, r := range cachedRecords {
					mxRecords = append(mxRecords, &net.MX{Host: r.Host, Pref: r.Pref})
				}
				return mxRecords, nil
			}
		}
	}

	client := &dns.Client{
		Timeout: 5 * time.Second,
		Net:     "udp",
	}

	msg := new(dns.Msg)
	msg.SetQuestion(domain, dns.TypeMX)
	msg.RecursionDesired = true

	// Try each resolver in shuffled order
	shuffled := make([]string, len(resolvers))
	copy(shuffled, resolvers)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })

	var lastErr error
	for _, resolver := range shuffled {
		resp, _, err := client.Exchange(msg, resolver)
		if err != nil {
			lastErr = err
			// Try TCP if UDP fails (truncation / firewall)
			tcpClient := &dns.Client{Timeout: 5 * time.Second, Net: "tcp"}
			resp, _, err = tcpClient.Exchange(msg, resolver)
			if err != nil {
				lastErr = err
				continue
			}
		}

		if resp == nil || resp.Rcode != dns.RcodeSuccess {
			lastErr = &net.DNSError{Err: "non-success rcode", Name: domain}
			continue
		}

		mxRecords := make([]*net.MX, 0, len(resp.Answer))
		for _, rr := range resp.Answer {
			if mx, ok := rr.(*dns.MX); ok {
				host := strings.TrimSuffix(mx.Mx, ".")
				mxRecords = append(mxRecords, &net.MX{
					Host: host,
					Pref: mx.Preference,
				})
			}
		}

		if len(mxRecords) > 0 {
			if config.Redis != nil {
				var toCache []MXCacheEntry
				for _, mx := range mxRecords {
					toCache = append(toCache, MXCacheEntry{Host: mx.Host, Pref: mx.Pref})
				}
				if b, err := json.Marshal(toCache); err == nil {
					config.Redis.Set(config.Ctx, "domain_cache:mx:"+domainClean, string(b), 24*time.Hour)
				}
			}
			return mxRecords, nil
		}

		// No MX records — try A record fallback (RFC 5321 §5.1)
		break
	}

	// Fallback: check A record for the domain itself
	aMsg := new(dns.Msg)
	aMsg.SetQuestion(domain, dns.TypeA)
	aMsg.RecursionDesired = true

	for _, resolver := range shuffled {
		resp, _, err := client.Exchange(aMsg, resolver)
		if err != nil {
			continue
		}
		if resp != nil && len(resp.Answer) > 0 {
			// Domain has an A record — treat it as its own MX (RFC 5321 §5.1)
			mxRecords := []*net.MX{{Host: domainClean, Pref: 10}}
			if config.Redis != nil {
				toCache := []MXCacheEntry{{Host: domainClean, Pref: 10}}
				if b, err := json.Marshal(toCache); err == nil {
					config.Redis.Set(config.Ctx, "domain_cache:mx:"+domainClean, string(b), 24*time.Hour)
				}
			}
			return mxRecords, nil
		}
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, &net.DNSError{Err: "no MX or A records found", Name: domain}
}
