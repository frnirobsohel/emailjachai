package middleware

import (
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

const bffClientIPHeader = "X-EJP-Client-IP"

// PreserveBFFClientIP restores the real client IP from the Next.js BFF hop.
// Traefik often rewrites X-Forwarded-For / X-Real-IP to the Docker gateway (172.17.0.1)
// when API_BASE_URL is a public URL; X-EJP-Client-IP is left intact.
func PreserveBFFClientIP() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := strings.TrimSpace(c.GetHeader(bffClientIPHeader))
		if ip != "" && isPublicClientIP(ip) && remoteAddrIsPrivate(c) {
			c.Request.Header.Set("X-Forwarded-For", ip)
			c.Request.Header.Set("X-Real-IP", ip)
			c.Request.Header.Set("CF-Connecting-IP", ip)
		}
		c.Next()
	}
}

func remoteAddrIsPrivate(c *gin.Context) bool {
	host := c.Request.RemoteAddr
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate()
}

func isPublicClientIP(raw string) bool {
	ip := net.ParseIP(strings.TrimSpace(raw))
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	return true
}
