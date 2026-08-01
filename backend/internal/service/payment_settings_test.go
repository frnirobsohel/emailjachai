package service

import (
	"errors"
	"testing"
)

func TestValidatePaymentGatewayEnable(t *testing.T) {
	err := validatePaymentGatewayEnable(map[string]string{
		"stripe_enabled": "1",
		"stripe_public_key": "pk_test_x",
	})
	if !errors.Is(err, ErrPaymentStripeIncomplete) {
		t.Fatalf("got %v want ErrPaymentStripeIncomplete", err)
	}

	err = validatePaymentGatewayEnable(map[string]string{
		"stripe_enabled":        "1",
		"stripe_public_key":     "pk_test_x",
		"stripe_secret_key":     "sk_test_x",
		"stripe_webhook_secret": "whsec_x",
	})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
}

func TestValidateStripeKeyMode(t *testing.T) {
	err := validateStripeKeyMode(map[string]string{
		"stripe_test_mode":  "1",
		"stripe_public_key": "pk_live_x",
		"stripe_secret_key": "sk_test_x",
	})
	if !errors.Is(err, ErrPaymentStripeKeyMode) {
		t.Fatalf("got %v want ErrPaymentStripeKeyMode", err)
	}

	err = validateStripeKeyMode(map[string]string{
		"stripe_test_mode":  "1",
		"stripe_public_key": "pk_test_x",
		"stripe_secret_key": "sk_test_x",
	})
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
}

func TestIsValidAPIBaseURL(t *testing.T) {
	if !IsValidAPIBaseURL("https://api.example.com") {
		t.Fatal("https should pass")
	}
	if !IsValidAPIBaseURL("http://localhost:8000") {
		t.Fatal("localhost http should pass")
	}
	if IsValidAPIBaseURL("http://evil.com") {
		t.Fatal("non-local http should fail")
	}
	if IsValidAPIBaseURL("ftp://localhost") {
		t.Fatal("ftp should fail")
	}
}
