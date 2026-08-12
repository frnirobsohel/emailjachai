package helper

import "testing"

func TestNormalizeVerificationStatusMailboxFull(t *testing.T) {
	if got := NormalizeVerificationStatus("mailbox_full"); got != "valid" {
		t.Fatalf("mailbox_full = %q, want valid", got)
	}
	if got := NormalizeVerificationStatus("mailbox-full"); got != "valid" {
		t.Fatalf("mailbox-full = %q, want valid", got)
	}
	if got := ScoreForStatus("mailbox_full"); got != 100 {
		t.Fatalf("score = %d, want 100", got)
	}
}

func TestPromoteMailboxFullToValid(t *testing.T) {
	if got := PromoteMailboxFullToValid("unknown", true); got != "valid" {
		t.Fatalf("unknown+full = %q, want valid", got)
	}
	if got := PromoteMailboxFullToValid("valid", true); got != "valid" {
		t.Fatalf("valid+full = %q, want valid", got)
	}
	if got := PromoteMailboxFullToValid("invalid", true); got != "invalid" {
		t.Fatalf("invalid+full = %q, want invalid", got)
	}
	if got := PromoteMailboxFullToValid("unknown", false); got != "unknown" {
		t.Fatalf("unknown without full = %q, want unknown", got)
	}
	if got := PromoteMailboxFullToValid("catch_all", true); got != "catch_all" {
		t.Fatalf("catch_all+full = %q, want catch_all", got)
	}
}
