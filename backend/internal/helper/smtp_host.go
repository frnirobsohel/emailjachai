package helper

import (
	"fmt"
	"net"
	"strings"
)

// ValidatePublicSMTPHost resolves host and rejects private/link-local/metadata targets (SSRF guard).
func ValidatePublicSMTPHost(host string) error {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if host == "" {
		return fmt.Errorf("host is required")
	}
	if strings.ContainsAny(host, " \t\r\n/") {
		return fmt.Errorf("invalid host")
	}

	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return fmt.Errorf("host must be a public address")
		}
		return nil
	}

	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("unable to resolve host")
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return fmt.Errorf("host resolves to a private or blocked address")
		}
	}
	return nil
}

func isPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	// AWS/GCP/Azure metadata
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
	}
	return true
}
