package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPreserveBFFClientIP_RestoresPublicIPFromPrivateHop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies([]string{"172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16", "127.0.0.1"}); err != nil {
		t.Fatal(err)
	}
	r.Use(PreserveBFFClientIP())
	r.GET("/t", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
	})

	req := httptest.NewRequest(http.MethodGet, "/t", nil)
	req.RemoteAddr = "172.17.0.1:54321"
	req.Header.Set("X-Forwarded-For", "172.17.0.1")
	req.Header.Set("X-Real-IP", "172.17.0.1")
	req.Header.Set("X-EJP-Client-IP", "103.166.59.159")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := w.Body.String(); got != "103.166.59.159" {
		t.Fatalf("ClientIP = %q, want 103.166.59.159", got)
	}
}

func TestPreserveBFFClientIP_IgnoresSpoofFromPublicRemote(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies([]string{"172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16", "127.0.0.1"}); err != nil {
		t.Fatal(err)
	}
	r.Use(PreserveBFFClientIP())
	r.GET("/t", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
	})

	req := httptest.NewRequest(http.MethodGet, "/t", nil)
	req.RemoteAddr = "203.0.113.50:443"
	req.Header.Set("X-EJP-Client-IP", "103.166.59.159")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := w.Body.String(); got != "203.0.113.50" {
		t.Fatalf("ClientIP = %q, want 203.0.113.50", got)
	}
}
