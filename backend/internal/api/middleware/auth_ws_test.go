package middleware

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestExtractWSTokenFromSubprotocol(t *testing.T) {
	gin.SetMode(gin.TestMode)

	jwt := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"
	encoded := base64.RawURLEncoding.EncodeToString([]byte(jwt))
	protocol := wsAuthProtocolPrefix + encoded

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws", nil)
	req.Header.Set("Sec-WebSocket-Protocol", protocol)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	token, selected := extractWSToken(c)
	if token != jwt {
		t.Fatalf("token mismatch: got %q want %q", token, jwt)
	}
	if selected != protocol {
		t.Fatalf("protocol mismatch: got %q want %q", selected, protocol)
	}
}

func TestExtractWSTokenFromBearer(t *testing.T) {
	gin.SetMode(gin.TestMode)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws", nil)
	req.Header.Set("Authorization", "Bearer secret-key-value")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	token, selected := extractWSToken(c)
	if token != "secret-key-value" {
		t.Fatalf("token mismatch: got %q", token)
	}
	if selected != "" {
		t.Fatalf("expected empty protocol, got %q", selected)
	}
}

func TestExtractWSTokenRejectsQueryParam(t *testing.T) {
	gin.SetMode(gin.TestMode)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?token=should-not-work", nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	token, _ := extractWSToken(c)
	if token != "" {
		t.Fatalf("query token should be ignored, got %q", token)
	}
}
