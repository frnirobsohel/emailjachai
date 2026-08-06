package engine

import (
	"context"
	"testing"
	"time"
)

func TestSmtpVerifyTimeoutDefault(t *testing.T) {
	t.Setenv("SMTP_VERIFY_TIMEOUT_SEC", "")
	if got := smtpVerifyTimeout(); got != defaultSMTPVerifyTimeout {
		t.Fatalf("default timeout = %v, want %v", got, defaultSMTPVerifyTimeout)
	}
}

func TestSmtpVerifyTimeoutFromEnv(t *testing.T) {
	t.Setenv("SMTP_VERIFY_TIMEOUT_SEC", "12")
	if got := smtpVerifyTimeout(); got != 12*time.Second {
		t.Fatalf("timeout = %v, want 12s", got)
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

func TestVerifyEmailInvalidSyntax(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = ctx

	result := VerifyEmail("not-an-email")
	if result.Status == "valid" {
		t.Fatalf("expected non-valid status for bad syntax, got %#v", result)
	}
	if result.SyntaxValid {
		t.Fatal("expected SyntaxValid=false")
	}
}
