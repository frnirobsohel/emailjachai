package handler

import "testing"

func TestNormalizeCacheStatus(t *testing.T) {
	cases := map[string]string{
		"valid":         "valid",
		"Deliverable":   "valid",
		"invalid":       "invalid",
		"undeliverable": "invalid",
		"catch-all":     "catch_all",
		"unknown":       "unknown",
		"risky":         "unknown",
		"maybe":         "",
		"":              "",
	}
	for in, want := range cases {
		if got := normalizeCacheStatus(in); got != want {
			t.Fatalf("normalizeCacheStatus(%q)=%q want %q", in, got, want)
		}
	}
}

func TestParseRetentionDays(t *testing.T) {
	if _, err := parseRetentionDays("0"); err == nil {
		t.Fatal("expected error for 0")
	}
	if _, err := parseRetentionDays("3651"); err == nil {
		t.Fatal("expected error for 3651")
	}
	v, err := parseRetentionDays("30")
	if err != nil || v != 30 {
		t.Fatalf("got %d %v", v, err)
	}
}

func TestParsePurgeOlderDays(t *testing.T) {
	v, err := parsePurgeOlderDays("0")
	if err != nil || v != 0 {
		t.Fatalf("days=0 must be allowed, got %d %v", v, err)
	}
	v, err = parsePurgeOlderDays("7")
	if err != nil || v != 7 {
		t.Fatalf("got %d %v", v, err)
	}
	if _, err := parsePurgeOlderDays("-1"); err == nil {
		t.Fatal("expected error for -1")
	}
	if _, err := parsePurgeOlderDays("3651"); err == nil {
		t.Fatal("expected error for 3651")
	}
}

func TestIsCacheFreeDomain(t *testing.T) {
	if !isCacheFreeDomain("a@gmail.com") {
		t.Fatal("gmail should be free")
	}
	if isCacheFreeDomain("a@acme.corp") {
		t.Fatal("acme should not be free")
	}
}
