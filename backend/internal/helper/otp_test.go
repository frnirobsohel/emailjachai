package helper

import (
	"testing"
)

func TestGenerateOTPCodeFormat(t *testing.T) {
	code, err := GenerateOTPCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 6 {
		t.Fatalf("expected 6 digits, got %q", code)
	}
	for _, c := range code {
		if c < '0' || c > '9' {
			t.Fatalf("non-digit in code: %q", code)
		}
	}
}

func TestCompareOTPHash(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-otp-hash")
	hash := HashOTP("123456")
	if !CompareOTPHash("123456", hash) {
		t.Fatal("expected matching hash")
	}
	if CompareOTPHash("000000", hash) {
		t.Fatal("expected mismatch")
	}
}
