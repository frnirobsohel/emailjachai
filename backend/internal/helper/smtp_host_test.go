package helper

import (
	"errors"
	"net"
	"strings"
	"testing"
)

func TestValidatePublicSMTPHost_RejectsPrivate(t *testing.T) {
	cases := []string{
		"127.0.0.1", "::1", "localhost",
		"10.0.0.1", "192.168.1.1", "172.16.0.1",
		"169.254.169.254", "100.64.0.1", "0.0.0.0",
	}
	for _, host := range cases {
		if err := ValidatePublicSMTPHost(host); err == nil {
			t.Fatalf("expected reject for %q", host)
		}
	}
}

func TestPublicSMTPDialIPs_LiteralPublic(t *testing.T) {
	ips, err := PublicSMTPDialIPs("8.8.8.8")
	if err != nil || len(ips) != 1 || ips[0].String() != "8.8.8.8" {
		t.Fatalf("public literal: ips=%v err=%v", ips, err)
	}
}

func TestPublicSMTPDialIPs_RejectsDualHomed(t *testing.T) {
	prev := lookupIP
	lookupIP = func(string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("8.8.8.8"), net.ParseIP("10.0.0.1")}, nil
	}
	t.Cleanup(func() { lookupIP = prev })

	ips, err := PublicSMTPDialIPs("mixed.example")
	if err == nil || ips != nil {
		t.Fatalf("dual-homed must reject entire host, ips=%v err=%v", ips, err)
	}
}

func TestPublicSMTPDialIPs_DNSFailIsNotBlockedHost(t *testing.T) {
	prev := lookupIP
	lookupIP = func(string) ([]net.IP, error) {
		return nil, errors.New("nxdomain")
	}
	t.Cleanup(func() { lookupIP = prev })

	_, err := PublicSMTPDialIPs("missing.example")
	if err == nil || IsBlockedSMTPHost(err) {
		t.Fatalf("resolve failure must not look like SSRF block, err=%v", err)
	}
}

func TestLimitSMTPDialIPsPrefersIPv4(t *testing.T) {
	v6a := net.ParseIP("2001:4860:4860::8888")
	v6b := net.ParseIP("2001:4860:4860::8844")
	v4a := net.ParseIP("8.8.8.8")
	v4b := net.ParseIP("8.8.4.4")
	got := limitSMTPDialIPs([]net.IP{v6a, v6b, v4a, v4b})
	if len(got) != 2 || got[0].String() != "8.8.8.8" || got[1].String() != "2001:4860:4860::8888" {
		t.Fatalf("got %v, want [8.8.8.8, 2001:4860:4860::8888]", got)
	}
}

func TestSanitizeEmailTemplateHTML(t *testing.T) {
	in := `Hello <script>alert(1)</script><b onclick="x">ok</b> javascript:alert(1)`
	out := SanitizeEmailTemplateHTML(in)
	if strings.Contains(out, "<script") || strings.Contains(out, "onclick") || strings.Contains(out, "javascript:") {
		t.Fatalf("unsafe content remained: %q", out)
	}
}
