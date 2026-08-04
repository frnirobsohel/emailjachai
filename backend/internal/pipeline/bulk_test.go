package pipeline

import (
	"strings"
	"testing"
)

func TestNormalizeAndDedup(t *testing.T) {
	in := []string{"  A@B.com ", "a@b.com", "", "c@d.com"}
	out := NormalizeAndDedup(in)
	if len(out) != 2 || out[0] != "a@b.com" || out[1] != "c@d.com" {
		t.Fatalf("unexpected: %#v", out)
	}
}

func TestAdaptiveShuffleInterleavesDomains(t *testing.T) {
	emails := []string{
		"a@gmail.com", "b@gmail.com", "c@gmail.com",
		"a@corp.com", "b@corp.com",
		"a@other.io",
	}
	out := AdaptiveShuffle(emails)
	if len(out) != len(emails) {
		t.Fatalf("len=%d want %d", len(out), len(emails))
	}
	// First three should not all be the same domain when multiple domains exist.
	same := 0
	for i := 1; i < len(out) && i < 4; i++ {
		if DomainOf(out[i]) == DomainOf(out[i-1]) {
			same++
		}
	}
	if same >= 3 {
		t.Fatalf("expected interleaving, got consecutive same-domain run: %v", out[:4])
	}
	// Set equality
	seen := map[string]bool{}
	for _, e := range out {
		seen[e] = true
	}
	for _, e := range emails {
		if !seen[e] {
			t.Fatalf("missing %s", e)
		}
	}
}

func TestBuildDynamicChunksCapsPerDomain(t *testing.T) {
	emails := make([]string, 0, 200)
	for i := 0; i < 200; i++ {
		emails = append(emails, "u"+strings.Repeat("x", i%3)+"@only.com")
	}
	cfg := PrepareConfig{BaseChunkSize: 100, MaxPerDomain: 20, MinChunkSize: 10}
	chunks := BuildDynamicChunks(emails, cfg)
	if len(chunks) < 5 {
		t.Fatalf("expected many small chunks for single-domain list, got %d", len(chunks))
	}
	for _, c := range chunks {
		size := c.EndIndex - c.StartIndex + 1
		if size > cfg.MaxPerDomain {
			t.Fatalf("chunk size %d exceeds maxPerDomain %d", size, cfg.MaxPerDomain)
		}
	}
}

func TestPrepareQueue(t *testing.T) {
	emails := []string{"a@x.com", "b@y.com", "c@x.com", "d@y.com"}
	ordered, chunks := PrepareQueue(emails, 1000)
	if len(ordered) != 4 {
		t.Fatalf("ordered len=%d", len(ordered))
	}
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0].StartIndex != 0 || chunks[0].EndIndex != 3 {
		t.Fatalf("bad chunk %#v", chunks[0])
	}
}

func TestAsynqQueueForRole(t *testing.T) {
	cases := map[string]string{
		"admin": "critical", "Reseller": "critical", "user": "default", "demo": "low", "": "default",
	}
	for role, want := range cases {
		if got := AsynqQueueForRole(role); got != want {
			t.Fatalf("role %q: got %q want %q", role, got, want)
		}
	}
}

func TestResolveDomainIntel(t *testing.T) {
	policies := map[string]string{
		"tempmail.com": "disposable",
		"bad.com":      "blacklist",
	}
	r, ok := ResolveDomainIntel("a@tempmail.com", policies)
	if !ok || r.Status != "disposable" {
		t.Fatalf("disposable: %#v ok=%v", r, ok)
	}
	r, ok = ResolveDomainIntel("a@sub.bad.com", policies)
	if !ok || r.Reason != "blacklist" {
		t.Fatalf("blacklist parent: %#v ok=%v", r, ok)
	}
	_, ok = ResolveDomainIntel("a@gmail.com", policies)
	if ok {
		t.Fatal("gmail should not short-circuit SMTP")
	}
}
