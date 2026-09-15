package egress

import (
	"context"
	"errors"
	"net"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"ejp-worker/pkg/logger"
	"go.uber.org/zap"
)

// IPStatus tracks individual egress IP health and cooldown.
type IPStatus struct {
	IP          net.IP
	CooldownEnd time.Time
	FailStreak  int
}

// Pool manages a rotation of local egress IP addresses for outgoing SMTP connections.
type Pool struct {
	mu      sync.RWMutex
	ips     []*IPStatus
	counter uint64
	enabled bool
}

var (
	// DefaultPool is the global egress pool instance initialized from environment.
	DefaultPool = NewPoolFromEnv()
)

// NewPoolFromEnv initializes a Pool from EGRESS_IPS environment variable.
// Example: EGRESS_IPS="198.51.100.10,198.51.100.11,198.51.100.12"
func NewPoolFromEnv() *Pool {
	raw := strings.TrimSpace(os.Getenv("EGRESS_IPS"))
	if raw == "" {
		return &Pool{enabled: false}
	}

	parts := strings.Split(raw, ",")
	var list []*IPStatus
	for _, p := range parts {
		ipStr := strings.TrimSpace(p)
		if ipStr == "" {
			continue
		}
		parsed := net.ParseIP(ipStr)
		if parsed == nil {
			logger.Warn("invalid egress IP ignored", zap.String("ip", ipStr))
			continue
		}
		list = append(list, &IPStatus{
			IP: parsed,
		})
	}

	if len(list) == 0 {
		return &Pool{enabled: false}
	}

	logger.Info("multi-IP egress pool initialized", zap.Int("total_ips", len(list)))
	return &Pool{
		ips:     list,
		enabled: true,
	}
}

// NewPool creates a pool directly with specified IP strings (useful for testing or programmatic config).
func NewPool(ipList []string) *Pool {
	var list []*IPStatus
	for _, s := range ipList {
		parsed := net.ParseIP(strings.TrimSpace(s))
		if parsed != nil {
			list = append(list, &IPStatus{IP: parsed})
		}
	}
	if len(list) == 0 {
		return &Pool{enabled: false}
	}
	return &Pool{
		ips:     list,
		enabled: true,
	}
}

// IsEnabled returns whether multiple egress IPs are active.
func (p *Pool) IsEnabled() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.enabled && len(p.ips) > 0
}

// TotalIPs returns the number of IPs configured in the pool.
func (p *Pool) TotalIPs() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.ips)
}

// PickIP selects the next healthy egress IP using round-robin.
// If all IPs are currently cooling down, falls back to the least-recently cooled IP.
// If multi-IP is not enabled, returns nil (system default interface).
func (p *Pool) PickIP() net.IP {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if !p.enabled || len(p.ips) == 0 {
		return nil
	}

	now := time.Now()
	n := len(p.ips)
	idx := atomic.AddUint64(&p.counter, 1)

	// Try round-robin search for a non-cooling IP
	for i := 0; i < n; i++ {
		candidate := p.ips[(int(idx)+i)%n]
		if candidate.CooldownEnd.Before(now) {
			return candidate.IP
		}
	}

	// All IPs in cooldown: pick the round-robin choice as best effort
	return p.ips[int(idx)%n].IP
}

// MarkCooldown puts an egress IP into temporary cooldown (e.g. after 421 greylisting/block).
func (p *Pool) MarkCooldown(ip net.IP, duration time.Duration) {
	if ip == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, item := range p.ips {
		if item.IP.Equal(ip) {
			item.CooldownEnd = time.Now().Add(duration)
			item.FailStreak++
			logger.Warn("egress IP marked for cooldown",
				zap.String("ip", ip.String()),
				zap.Duration("duration", duration),
			)
			return
		}
	}
}

// MarkSuccess clears failure streak for an egress IP.
func (p *Pool) MarkSuccess(ip net.IP) {
	if ip == nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	for _, item := range p.ips {
		if item.IP.Equal(ip) {
			item.FailStreak = 0
			return
		}
	}
}

// Dial connects to the address on the named network with a chosen egress IP and timeout.
// Implements the same signature as net.DialTimeout.
func (p *Pool) Dial(network, address string, timeout time.Duration) (net.Conn, error) {
	return p.DialContext(context.Background(), network, address, timeout)
}

// DialContext connects using an optional local address from the pool.
func (p *Pool) DialContext(ctx context.Context, network, address string, timeout time.Duration) (net.Conn, error) {
	selectedIP := p.PickIP()

	dialer := &net.Dialer{
		Timeout: timeout,
	}

	if selectedIP != nil {
		dialer.LocalAddr = &net.TCPAddr{
			IP: selectedIP,
		}
	}

	conn, err := dialer.DialContext(ctx, network, address)
	if err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			p.MarkCooldown(selectedIP, 15*time.Second)
		}
		return nil, err
	}

	p.MarkSuccess(selectedIP)
	return conn, nil
}
