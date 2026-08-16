package engine

import (
	"errors"
	"fmt"
	"net"
	"strings"
)

var lookupIP = net.LookupIP

var (
	ErrPrivateSMTPHost = errors.New("smtp host is not a public address")
	ErrInvalidSMTPHost = errors.New("invalid smtp host")
)

func IsBlockedSMTPHost(err error) bool {
	return errors.Is(err, ErrPrivateSMTPHost) || errors.Is(err, ErrInvalidSMTPHost)
}

func PublicSMTPDialIPs(host string) ([]net.IP, error) {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "[")
	host = strings.TrimSuffix(host, "]")
	if host == "" {
		return nil, fmt.Errorf("%w: host is required", ErrInvalidSMTPHost)
	}
	if strings.ContainsAny(host, " \t\r\n/") {
		return nil, fmt.Errorf("%w", ErrInvalidSMTPHost)
	}

	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return nil, fmt.Errorf("%w", ErrPrivateSMTPHost)
		}
		return []net.IP{ip}, nil
	}

	ips, err := lookupIP(host)
	if err != nil || len(ips) == 0 {
		return nil, fmt.Errorf("unable to resolve host")
	}
	out := make([]net.IP, 0, len(ips))
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return nil, fmt.Errorf("%w", ErrPrivateSMTPHost)
		}
		out = append(out, ip)
	}
	return limitSMTPDialIPs(out), nil
}

func limitSMTPDialIPs(ips []net.IP) []net.IP {
	if len(ips) < 2 {
		return ips
	}
	var v4, v6 []net.IP
	for _, ip := range ips {
		if ip == nil {
			continue
		}
		if ip.To4() != nil {
			v4 = append(v4, ip)
		} else {
			v6 = append(v6, ip)
		}
	}
	out := make([]net.IP, 0, 2)
	if len(v4) > 0 {
		out = append(out, v4[0])
	}
	if len(v6) > 0 {
		out = append(out, v6[0])
	}
	return out
}

func isPublicIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return false
		}
	}
	return true
}
