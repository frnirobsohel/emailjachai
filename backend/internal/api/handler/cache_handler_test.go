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

func TestIsCacheFreeDomain(t *testing.T) {
	if !isCacheFreeDomain("a@gmail.com") {
		t.Fatal("gmail should be free")
	}
	if isCacheFreeDomain("a@acme.corp") {
		t.Fatal("acme should not be free")
	}
}
