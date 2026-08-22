package engine

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/patrickmn/go-cache"
)

func TestSmtpVerifyTimeoutDefault(t *testing.T) {
	t.Setenv("SMTP_VERIFY_TIMEOUT_SEC", "")
	if got := smtpVerifyTimeout(); got != defaultSMTPVerifyTimeout {
		t.Fatalf("default timeout = %v, want %v", got, defaultSMTPVerifyTimeout)
	}
}

func TestSmtpVerifyTimeoutFromEnv(t *testing.T) {
	t.Setenv("SMTP_VERIFY_TIMEOUT_SEC", "200")
	if got := smtpVerifyTimeout(); got != 200*time.Second {
		t.Fatalf("timeout = %v, want 200s", got)
	}
}

func TestSmtpVerifyTimeoutFloor(t *testing.T) {
	t.Setenv("SMTP_VERIFY_TIMEOUT_SEC", "45")
	if got := smtpVerifyTimeout(); got != defaultSMTPVerifyTimeout {
		t.Fatalf("timeout = %v, want floor %v", got, defaultSMTPVerifyTimeout)
	}
}

func TestDomainCachePolicies(t *testing.T) {
	cache := &DomainCache{}
	cache.Update([]map[string]interface{}{
		{"domain": "mailinator.com", "type": "disposable"},
		{"domain": "gmail.com", "type": "free"},
		{"domain": "bad.example", "type": "blacklist"},
	})

	free, disposable, _, blacklisted := cache.GetPolicy("mailinator.com")
	if free || !disposable || blacklisted {
		t.Fatalf("mailinator policy unexpected: free=%v disposable=%v blacklisted=%v", free, disposable, blacklisted)
	}

	free, disposable, _, blacklisted = cache.GetPolicy("gmail.com")
	if !free || disposable || blacklisted {
		t.Fatalf("gmail policy unexpected: free=%v disposable=%v blacklisted=%v", free, disposable, blacklisted)
	}

	free, disposable, _, blacklisted = cache.GetPolicy("bad.example")
	if free || disposable || !blacklisted {
		t.Fatalf("blacklist policy unexpected: free=%v disposable=%v blacklisted=%v", free, disposable, blacklisted)
	}
}

func TestWaitDomainRateLimitRespectsCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := WaitDomainRateLimit(ctx, "gmail.com", true)
	if err == nil {
		t.Fatal("expected wait to fail on cancelled context")
	}
}

func TestVerifyEmailInvalidSyntax(t *testing.T) {
	result := VerifyEmail(context.Background(), "not-an-email")
	if result.Status == "valid" {
		t.Fatalf("expected non-valid status for bad syntax, got %#v", result)
	}
	if result.SyntaxValid {
		t.Fatal("expected SyntaxValid=false")
	}
	if result.Reason != "syntax" {
		t.Fatalf("reason = %q, want syntax", result.Reason)
	}

	result = VerifyEmail(context.Background(), "a@b")
	if result.Status != "invalid" || result.SyntaxValid || result.Reason != "syntax" {
		t.Fatalf("a@b must be syntax-invalid, got %#v", result)
	}
}

func TestIsValidMailboxSyntax(t *testing.T) {
	if !IsValidMailboxSyntax("user@example.com") {
		t.Fatal("expected valid")
	}
	if IsValidMailboxSyntax("a@b") {
		t.Fatal("expected invalid")
	}
}

func TestLookupWorkerMXNoDNSFailCache(t *testing.T) {
	domain := "g7-temp-dns.example"
	MXCache.Delete(domain)

	origMX, origHost := lookupMXFn, lookupHostFn
	t.Cleanup(func() {
		lookupMXFn, lookupHostFn = origMX, origHost
		MXCache.Delete(domain)
	})

	tempErr := &net.DNSError{Err: "server misbehaving", Name: domain, IsTemporary: true}
	lookupMXFn = func(string) ([]*net.MX, error) { return nil, tempErr }
	lookupHostFn = func(string) ([]string, error) { return nil, tempErr }

	records, aFallback, temporary, err := lookupWorkerMX(domain)
	if len(records) != 0 || aFallback || !temporary || err == nil {
		t.Fatalf("want empty+temp+err, got records=%v aFallback=%v temp=%v err=%v", records, aFallback, temporary, err)
	}
	if _, found := MXCache.Get(domain); found {
		t.Fatal("DNS failure must not be cached")
	}

	// Legacy empty poison must be dropped, then live lookup can succeed.
	MXCache.Set(domain, []*net.MX{}, cache.DefaultExpiration)
	lookupMXFn = func(string) ([]*net.MX, error) {
		return []*net.MX{{Host: "mx.example.com.", Pref: 10}}, nil
	}
	lookupHostFn = func(string) ([]string, error) {
		return nil, &net.DNSError{Err: "no such host", Name: domain, IsNotFound: true}
	}

	records, aFallback, temporary, err = lookupWorkerMX(domain)
	if aFallback || temporary || err != nil || len(records) != 1 || records[0].Host != "mx.example.com." {
		t.Fatalf("after poison clear want MX hit, got records=%v aFallback=%v temp=%v err=%v", records, aFallback, temporary, err)
	}
}

func TestLookupWorkerMXAFallbackFlag(t *testing.T) {
	domain := "parked-g14.example"
	MXCache.Delete(domain)

	origMX, origHost := lookupMXFn, lookupHostFn
	t.Cleanup(func() {
		lookupMXFn, lookupHostFn = origMX, origHost
		MXCache.Delete(domain)
	})

	lookupMXFn = func(string) ([]*net.MX, error) {
		return nil, &net.DNSError{Err: "no such host", Name: domain, IsNotFound: true}
	}
	lookupHostFn = func(string) ([]string, error) {
		return []string{"203.0.113.10"}, nil
	}

	records, aFallback, temporary, err := lookupWorkerMX(domain)
	if err != nil || temporary || !aFallback || len(records) != 1 || records[0].Host != domain {
		t.Fatalf("want A-fallback, got records=%v aFallback=%v temp=%v err=%v", records, aFallback, temporary, err)
	}
	cached, found := MXCache.Get(domain)
	if !found {
		t.Fatal("A-fallback should be cached")
	}
	v, ok := cached.(mxCacheValue)
	if !ok || !v.AFallback {
		t.Fatalf("cache must remember AFallback, got %#v", cached)
	}
}

func TestIsTemporaryDNSError(t *testing.T) {
	if !isTemporaryDNSError(&net.DNSError{Err: "server misbehaving", IsTemporary: true}) {
		t.Fatal("temporary DNSError must be detected")
	}
	if isTemporaryDNSError(&net.DNSError{Err: "no such host", IsNotFound: true}) {
		t.Fatal("NXDOMAIN must not be treated as temporary")
	}
}

func TestVerifyEmailParkedAFallbackNoSMTP(t *testing.T) {
	domain := "parked-verify-g14.example"
	email := "user@" + domain
	MXCache.Delete(domain)

	origMX, origHost := lookupMXFn, lookupHostFn
	origResolve := resolvePublicSMTP
	origDial := smtpDial
	t.Cleanup(func() {
		lookupMXFn, lookupHostFn = origMX, origHost
		resolvePublicSMTP = origResolve
		smtpDial = origDial
		MXCache.Delete(domain)
	})

	lookupMXFn = func(string) ([]*net.MX, error) {
		return nil, &net.DNSError{Err: "no such host", Name: domain, IsNotFound: true}
	}
	lookupHostFn = func(string) ([]string, error) {
		return []string{"203.0.113.50"}, nil
	}
	resolvePublicSMTP = func(string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("203.0.113.50")}, nil
	}
	smtpDial = func(network, address string, timeout time.Duration) (net.Conn, error) {
		return nil, errors.New("connection refused")
	}

	result := VerifyEmail(context.Background(), email)
	if result.Status != "invalid" || result.Reason != "no_mail" || result.HasMX || result.SMTPConnect {
		t.Fatalf("parked A-fallback must be invalid/no_mail, got %#v", result)
	}
}
