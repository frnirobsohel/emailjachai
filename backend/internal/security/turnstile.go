package security

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const turnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type turnstileResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes"`
}

// TurnstileConfigured reports whether server-side Turnstile verification is enabled.
func TurnstileConfigured() bool {
	return strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY")) != ""
}

// TurnstileSiteKey returns the public site key for the frontend widget (may be empty).
func TurnstileSiteKey() string {
	return strings.TrimSpace(os.Getenv("TURNSTILE_SITE_KEY"))
}

// VerifyTurnstileToken validates a Cloudflare Turnstile response token.
// When TURNSTILE_SECRET_KEY is unset, verification is skipped (local/dev).
func VerifyTurnstileToken(token, remoteIP string) error {
	secret := strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY"))
	if secret == "" {
		return nil
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("captcha token is required")
	}

	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.PostForm(turnstileVerifyURL, form)
	if err != nil {
		return errors.New("captcha verification unavailable")
	}
	defer resp.Body.Close()

	var parsed turnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return errors.New("captcha verification failed")
	}
	if !parsed.Success {
		return errors.New("captcha verification failed")
	}
	return nil
}
