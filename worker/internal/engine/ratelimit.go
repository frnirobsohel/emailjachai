package engine

import (
	"context"
	"os"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/time/rate"
)

const (
	defaultDomainRPS     = 2.0
	defaultDomainBurst   = 4
	defaultFreeDomainRPS = 1.0
	defaultFreeBurst     = 2
)

var (
	domainLimiters sync.Map // domain -> *rate.Limiter
)

func domainRPS(free bool) (float64, int) {
	if free {
		rps := envFloat("SMTP_FREE_DOMAIN_RPS", defaultFreeDomainRPS)
		burst := envInt("SMTP_FREE_DOMAIN_BURST", defaultFreeBurst)
		return rps, burst
	}
	rps := envFloat("SMTP_DOMAIN_RPS", defaultDomainRPS)
	burst := envInt("SMTP_DOMAIN_BURST", defaultDomainBurst)
	return rps, burst
}

func envFloat(key string, fallback float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f <= 0 {
		return fallback
	}
	return f
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return fallback
	}
	return n
}

func limiterForDomain(domain string, free bool) *rate.Limiter {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		domain = "_unknown"
	}
	if v, ok := domainLimiters.Load(domain); ok {
		return v.(*rate.Limiter)
	}
	rps, burst := domainRPS(free)
	lim := rate.NewLimiter(rate.Limit(rps), burst)
	actual, _ := domainLimiters.LoadOrStore(domain, lim)
	return actual.(*rate.Limiter)
}

// WaitDomainRateLimit blocks until the per-domain SMTP budget allows another probe.
// Does not call the backend API — local worker-side limiter only.
func WaitDomainRateLimit(ctx context.Context, domain string, isFree bool) error {
	if ctx == nil {
		ctx = context.Background()
	}
	return limiterForDomain(domain, isFree).Wait(ctx)
}
