package config

import (
	"strconv"
)

const domainCacheChannel = "ejp_domains_changed"
const domainRevisionKey = "domains:revision"

// BumpDomainCacheRevision notifies workers that domain policy changed.
func BumpDomainCacheRevision() {
	if Redis == nil {
		return
	}
	_, _ = Redis.Incr(Ctx, domainRevisionKey).Result()
	_ = Redis.Publish(Ctx, domainCacheChannel, "1").Err()
}

// GetDomainCacheRevision returns the current domain policy revision (0 if unavailable).
func GetDomainCacheRevision() int64 {
	if Redis == nil {
		return 0
	}
	val, err := Redis.Get(Ctx, domainRevisionKey).Result()
	if err != nil {
		return 0
	}
	n, _ := strconv.ParseInt(val, 10, 64)
	return n
}

// DomainCacheChannel is the Redis pub/sub channel workers subscribe to.
func DomainCacheChannel() string {
	return domainCacheChannel
}
