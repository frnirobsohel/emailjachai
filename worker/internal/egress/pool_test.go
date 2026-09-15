package egress

import (
	"net"
	"testing"
	"time"
)

func TestPoolEmptyDefault(t *testing.T) {
	p := NewPool(nil)
	if p.IsEnabled() {
		t.Errorf("expected disabled pool, got enabled")
	}
	if ip := p.PickIP(); ip != nil {
		t.Errorf("expected nil IP for empty pool, got %v", ip)
	}
}

func TestPoolRoundRobin(t *testing.T) {
	ips := []string{"192.0.2.1", "192.0.2.2", "192.0.2.3"}
	p := NewPool(ips)

	if !p.IsEnabled() {
		t.Fatalf("expected pool to be enabled")
	}
	if p.TotalIPs() != 3 {
		t.Fatalf("expected 3 IPs, got %d", p.TotalIPs())
	}

	seen := make(map[string]bool)
	for i := 0; i < 6; i++ {
		ip := p.PickIP()
		if ip == nil {
			t.Fatalf("unexpected nil IP")
		}
		seen[ip.String()] = true
	}

	if len(seen) != 3 {
		t.Errorf("expected to see all 3 IPs, saw: %v", seen)
	}
}

func TestPoolCooldownBypasses(t *testing.T) {
	ips := []string{"192.0.2.10", "192.0.2.11"}
	p := NewPool(ips)

	targetIP := net.ParseIP("192.0.2.10")
	p.MarkCooldown(targetIP, 10*time.Minute)

	// Since 192.0.2.10 is in cooldown, PickIP should prefer 192.0.2.11
	for i := 0; i < 4; i++ {
		picked := p.PickIP()
		if picked.String() != "192.0.2.11" {
			t.Errorf("expected healthy IP 192.0.2.11, got: %s", picked.String())
		}
	}
}
