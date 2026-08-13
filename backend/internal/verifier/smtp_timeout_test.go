package verifier

import (
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
