package scheduler

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"
	"ejp-worker/pkg/safe"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var (
	rdbOnce sync.Once
	rdb     *redis.Client
)

// getRedis returns the shared Redis client for scheduler stats.
// Returns nil if Redis is unavailable or URL is not configured.
func getRedis() *redis.Client {
	rdbOnce.Do(func() {
		redisURL := os.Getenv("REDIS_URL")
		if redisURL == "" && config.Cfg != nil {
			redisURL = config.Cfg.RedisURL
		}
		if redisURL == "" {
			return
		}
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			logger.Error("scheduler failed to parse REDIS_URL", zap.Error(err))
			return
		}
		rdb = redis.NewClient(opt)
	})
	return rdb
}

// DomainHealth represents aggregated domain probe health.
type DomainHealth struct {
	Domain      string
	Successes   int64
	TempFails   int64
	Blocked     int64
	InCooldown  bool
	CooldownTTL time.Duration
}

// Outcome categorizes the result of an SMTP probe to a domain.
type Outcome int

const (
	OutcomeSuccess Outcome = iota
	OutcomeTempFail
	OutcomeBlocked
)

// RecordOutcome updates cluster-wide domain health counters in Redis asynchronously.
// Does not block the caller's critical path.
func RecordOutcome(domain string, outcome Outcome) {
	client := getRedis()
	if client == nil {
		return
	}

	normDomain := strings.ToLower(strings.TrimSpace(domain))
	if normDomain == "" {
		return
	}

	safe.Go(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		today := time.Now().UTC().Format("2006-01-02")
		pipe := client.Pipeline()

		switch outcome {
		case OutcomeSuccess:
			key := fmt.Sprintf("domain:stats:%s:%s:ok", normDomain, today)
			pipe.Incr(ctx, key)
			pipe.Expire(ctx, key, 48*time.Hour)
			// Reset consecutive failure streak
			streakKey := fmt.Sprintf("domain:streak:fail:%s", normDomain)
			pipe.Del(ctx, streakKey)

		case OutcomeTempFail:
			key := fmt.Sprintf("domain:stats:%s:%s:tempfail", normDomain, today)
			pipe.Incr(ctx, key)
			pipe.Expire(ctx, key, 48*time.Hour)

			// Increment consecutive failure streak
			streakKey := fmt.Sprintf("domain:streak:fail:%s", normDomain)
			streakCmd := pipe.Incr(ctx, streakKey)
			pipe.Expire(ctx, streakKey, 5*time.Minute)

			_, _ = pipe.Exec(ctx)

			// Check streak: if >= 3 consecutive temp-fails, trigger cluster cooldown
			if streak := streakCmd.Val(); streak >= 3 {
				cooldownDuration := 15 * time.Second
				if streak >= 6 {
					cooldownDuration = 45 * time.Second
				}
				TriggerCooldown(normDomain, cooldownDuration, "consecutive_temp_fails")
			}
			return

		case OutcomeBlocked:
			key := fmt.Sprintf("domain:stats:%s:%s:blocked", normDomain, today)
			pipe.Incr(ctx, key)
			pipe.Expire(ctx, key, 48*time.Hour)
			// Immediate cooldown on hard block/tarpit
			TriggerCooldown(normDomain, 60*time.Second, "smtp_tarpit_blocked")
		}

		_, _ = pipe.Exec(ctx)
	})
}

// TriggerCooldown marks a domain as paused/cooling down across all workers in Redis.
func TriggerCooldown(domain string, duration time.Duration, reason string) {
	client := getRedis()
	if client == nil {
		return
	}

	normDomain := strings.ToLower(strings.TrimSpace(domain))
	if normDomain == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cooldownKey := fmt.Sprintf("domain:cooldown:%s", normDomain)
	err := client.Set(ctx, cooldownKey, reason, duration).Err()
	if err == nil {
		logger.Warn("Cluster domain cooldown activated",
			zap.String("domain", normDomain),
			zap.Duration("duration", duration),
			zap.String("reason", reason),
		)
	}
}

// CheckCooldown returns whether a domain is currently in cluster-wide cooldown and the remaining TTL.
func CheckCooldown(ctx context.Context, domain string) (bool, time.Duration) {
	client := getRedis()
	if client == nil {
		return false, 0
	}

	normDomain := strings.ToLower(strings.TrimSpace(domain))
	if normDomain == "" {
		return false, 0
	}

	cooldownKey := fmt.Sprintf("domain:cooldown:%s", normDomain)
	ttl, err := client.TTL(ctx, cooldownKey).Result()
	if err != nil || ttl <= 0 {
		return false, 0
	}
	return true, ttl
}
