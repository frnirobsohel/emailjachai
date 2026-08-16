package engine

import (
	"net"
	"testing"
)

func TestPublicSMTPDialIPsRejectsPrivate(t *testing.T) {
	cases := []string{
		"127.0.0.1", "::1", "localhost",
		"10.0.0.1", "192.168.1.1", "172.16.0.1",
		"169.254.169.254", "100.64.0.1", "0.0.0.0",
	}
	for _, host := range cases {
		if _, err := PublicSMTPDialIPs(host); err == nil || !IsBlockedSMTPHost(err) {
			t.Fatalf("expected blocked host %q, err=%v", host, err)
		}
	}
}

func TestPublicSMTPDialIPsRejectsDualHomed(t *testing.T) {
	prev := lookupIP
	lookupIP = func(string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("8.8.8.8"), net.ParseIP("10.0.0.1")}, nil
	}
	t.Cleanup(func() { lookupIP = prev })

	if _, err := PublicSMTPDialIPs("mixed.example"); err == nil || !IsBlockedSMTPHost(err) {
		t.Fatal("dual-homed host must be blocked")
	}
}

func TestLimitSMTPDialIPsPrefersIPv4(t *testing.T) {
	v6 := net.ParseIP("2001:4860:4860::8888")
	v4 := net.ParseIP("8.8.8.8")
	got := limitSMTPDialIPs([]net.IP{v6, v4})
	if len(got) != 2 || got[0].String() != "8.8.8.8" {
		t.Fatalf("got %v, want IPv4 first", got)
	}
}

func TestPublicSMTPDialIPsLiteralPublic(t *testing.T) {
	ips, err := PublicSMTPDialIPs("8.8.8.8")
	if err != nil || len(ips) != 1 || ips[0].String() != "8.8.8.8" {
		t.Fatalf("public literal: ips=%v err=%v", ips, err)
	}
}
