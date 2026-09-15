package scheduler

import (
	"context"
	"errors"
	"time"
)

var (
	ErrDomainInCooldown = errors.New("domain is cooling down due to greylist/tarpit")
)

// WaitDomainSchedule gates an outgoing SMTP probe using cluster cooldown intelligence
// and local domain rate limits. If a domain is actively greylisting the cluster, it pauses
// or rejects early rather than burning connection attempts and getting IP-banned.
func WaitDomainSchedule(ctx context.Context, domain string, isFree bool, localLimiterWait func(context.Context, string, bool) error) error {
	if ctx == nil {
		ctx = context.Background()
	}

	// 1. Check Redis cluster cooldown
	inCooldown, ttl := CheckCooldown(ctx, domain)
	if inCooldown && ttl > 0 {
		if deadline, ok := ctx.Deadline(); ok {
			if time.Until(deadline) < ttl {
				return ErrDomainInCooldown
			}
		}
		// If wait is brief (e.g. <= 5s), pause before proceeding
		waitDuration := ttl
		if waitDuration > 5*time.Second {
			waitDuration = 5 * time.Second
		}
		select {
		case <-time.After(waitDuration):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	// 2. Local token-bucket rate limit wait
	if localLimiterWait != nil {
		return localLimiterWait(ctx, domain, isFree)
	}

	return nil
}
