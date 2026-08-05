// Package pipeline prepares bulk email lists before Asynq enqueue.
// Workers still only: take chunk → verify → report. No backend calls mid-SMTP.
package pipeline

import (
	"math/rand"
	"strings"
	"time"
)

// Chunk is an inclusive index range into a prepared email slice.
type Chunk struct {
	StartIndex int
	EndIndex   int
}

// PrepareConfig controls dynamic chunking behaviour.
type PrepareConfig struct {
	BaseChunkSize int
	// MaxPerDomain caps how many addresses from one domain land in a single chunk.
	MaxPerDomain int
	// MinChunkSize is the smallest chunk allowed when domain pressure is high.
	MinChunkSize int
}

// DefaultPrepareConfig returns production defaults derived from a settings base size.
func DefaultPrepareConfig(baseChunkSize int) PrepareConfig {
	if baseChunkSize < 50 {
		baseChunkSize = 50
	}
	maxPer := baseChunkSize / 10
	if maxPer < 25 {
		maxPer = 25
	}
	if maxPer > 100 {
		maxPer = 100
	}
	return PrepareConfig{
		BaseChunkSize: baseChunkSize,
		MaxPerDomain:  maxPer,
		MinChunkSize:  50,
	}
}

// NormalizeAndDedup lowercases, trims, and unique-ifies emails (order preserved).
func NormalizeAndDedup(emails []string) []string {
	out := make([]string, 0, len(emails))
	seen := make(map[string]struct{}, len(emails))
	for _, raw := range emails {
		email := strings.ToLower(strings.TrimSpace(raw))
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		out = append(out, email)
	}
	return out
}

// DomainOf returns the domain part of an email, or empty if malformed.
func DomainOf(email string) string {
	at := strings.LastIndexByte(email, '@')
	if at < 0 || at == len(email)-1 {
		return ""
	}
	return email[at+1:]
}

// GroupByDomain buckets emails by domain (insertion order of domains preserved via separate call).
func GroupByDomain(emails []string) (map[string][]string, []string) {
	groups := make(map[string][]string)
	order := make([]string, 0)
	for _, email := range emails {
		d := DomainOf(email)
		if d == "" {
			d = "_invalid"
		}
		if _, ok := groups[d]; !ok {
			order = append(order, d)
			groups[d] = nil
		}
		groups[d] = append(groups[d], email)
	}
	return groups, order
}

// AdaptiveShuffle round-robins across domains so one MX is not hammered consecutively.
// Domain order and within-domain lists are shuffled for unpredictability.
func AdaptiveShuffle(emails []string) []string {
	if len(emails) <= 1 {
		return append([]string(nil), emails...)
	}

	groups, order := GroupByDomain(emails)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	for _, d := range order {
		rng.Shuffle(len(groups[d]), func(i, j int) {
			groups[d][i], groups[d][j] = groups[d][j], groups[d][i]
		})
	}

	out := make([]string, 0, len(emails))
	for len(out) < len(emails) {
		progress := false
		for _, d := range order {
			if len(groups[d]) == 0 {
				continue
			}
			out = append(out, groups[d][0])
			groups[d] = groups[d][1:]
			progress = true
		}
		if !progress {
			break
		}
	}
	return out
}

// knownFreeDomains are used for dynamic chunk sizing and is_free classification.
// Single shared list for prepare pipeline + cache upload (keep in sync intentionally).
var knownFreeDomains = map[string]struct{}{
	"gmail.com": {}, "googlemail.com": {},
	"yahoo.com": {}, "yahoo.co.uk": {}, "ymail.com": {}, "rocketmail.com": {},
	"outlook.com": {}, "hotmail.com": {}, "live.com": {}, "msn.com": {},
	"icloud.com": {}, "me.com": {}, "mac.com": {},
	"aol.com": {}, "protonmail.com": {}, "proton.me": {},
	"zoho.com": {}, "zohomail.com": {}, "gmx.com": {}, "gmx.net": {},
	"mail.com": {}, "yandex.com": {}, "yandex.ru": {},
	"mail.ru": {}, "inbox.com": {}, "fastmail.com": {},
}

// IsKnownFreeDomain reports whether domain is a major free mailbox provider.
func IsKnownFreeDomain(domain string) bool {
	_, ok := knownFreeDomains[strings.ToLower(strings.TrimSpace(domain))]
	return ok
}

// BuildDynamicChunks sizes chunks by domain diversity and caps per-domain density.
func BuildDynamicChunks(emails []string, cfg PrepareConfig) []Chunk {
	n := len(emails)
	if n == 0 {
		return nil
	}
	if cfg.BaseChunkSize < 1 {
		cfg.BaseChunkSize = 1000
	}
	if cfg.MinChunkSize < 1 {
		cfg.MinChunkSize = 50
	}
	if cfg.MaxPerDomain < 1 {
		cfg.MaxPerDomain = 50
	}

	chunks := make([]Chunk, 0, (n/cfg.BaseChunkSize)+1)
	i := 0
	for i < n {
		target := dynamicTargetSize(emails, i, cfg)
		domainCount := make(map[string]int)
		end := i
		for end < n && (end-i) < target {
			d := DomainOf(emails[end])
			if d == "" {
				d = "_invalid"
			}
			if domainCount[d] >= cfg.MaxPerDomain {
				if end == i {
					// Always advance at least one email to avoid a stuck loop.
					end++
				}
				break
			}
			domainCount[d]++
			end++
		}
		if end <= i {
			end = i + 1
		}
		chunks = append(chunks, Chunk{StartIndex: i, EndIndex: end - 1})
		i = end
	}
	return chunks
}

func dynamicTargetSize(emails []string, start int, cfg PrepareConfig) int {
	window := cfg.BaseChunkSize
	if start+window > len(emails) {
		window = len(emails) - start
	}
	if window <= 0 {
		return cfg.MinChunkSize
	}

	unique := make(map[string]struct{}, 64)
	freeHits := 0
	for i := start; i < start+window; i++ {
		d := DomainOf(emails[i])
		unique[d] = struct{}{}
		if IsKnownFreeDomain(d) {
			freeHits++
		}
	}

	size := cfg.BaseChunkSize
	switch {
	case len(unique) <= 2:
		size = cfg.BaseChunkSize / 4
	case len(unique) <= 10:
		size = cfg.BaseChunkSize / 2
	case freeHits*2 >= window:
		size = cfg.BaseChunkSize / 2
	}
	if size < cfg.MinChunkSize {
		size = cfg.MinChunkSize
	}
	if size > cfg.BaseChunkSize {
		size = cfg.BaseChunkSize
	}
	return size
}

// PrepareQueue runs Domain Grouping → Adaptive Shuffle → Dynamic Chunk Builder.
func PrepareQueue(emails []string, baseChunkSize int) (ordered []string, chunks []Chunk) {
	ordered = AdaptiveShuffle(emails)
	chunks = BuildDynamicChunks(ordered, DefaultPrepareConfig(baseChunkSize))
	return ordered, chunks
}

// AsynqQueueForRole maps user roles onto weighted Asynq queues (worker weights: critical 6 / default 3 / low 1).
func AsynqQueueForRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "manager", "reseller":
		return "critical"
	case "demo":
		return "low"
	default:
		return "default"
	}
}
