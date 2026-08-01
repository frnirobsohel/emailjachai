package service

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"ejp-backend/internal/helper"
)

var (
	ErrPaymentProviderInvalid   = errors.New("invalid payment provider")
	ErrPaymentStripeIncomplete  = errors.New("stripe requires public key, secret key, and webhook secret when enabled")
	ErrPaymentPayPalIncomplete  = errors.New("paypal requires client id, secret, and webhook id when enabled")
	ErrPaymentCryptoIncomplete  = errors.New("cryptomus requires merchant uuid and payment api key when enabled")
	ErrPaymentStripeKeyMode     = errors.New("stripe keys do not match test/live mode")
	ErrPaymentAPIBaseURLInvalid = errors.New("invalid api base url")
	ErrPaymentSecretDecrypt     = errors.New("stored payment secret could not be decrypted")
	ErrPaymentGatewayDisabled   = errors.New("enable the gateway before testing")
)

// PaymentGatewayView is the admin UI shape (secrets never included).
type PaymentGatewayView struct {
	Enabled          bool   `json:"enabled"`
	TestMode         bool   `json:"test_mode"`
	PublicKey        string `json:"public_key"`
	MerchantID       string `json:"merchant_id,omitempty"`
	HasSecretKey     bool   `json:"has_secret_key"`
	HasWebhookSecret bool   `json:"has_webhook_secret"`
	HasPaymentKey    bool   `json:"has_payment_key"`
}

// PaymentSettingsView is returned by GET /admin/settings/payment.
type PaymentSettingsView struct {
	APIBaseURL  string                        `json:"api_base_url"`
	WebhookURLs map[string]string             `json:"webhook_urls"`
	Gateways    map[string]PaymentGatewayView `json:"gateways"`
}

// PaymentGatewayUpdate is POST /admin/settings/payment body (one provider + optional api_base_url).
type PaymentGatewayUpdate struct {
	Provider      string `json:"provider"`
	APIBaseURL    string `json:"api_base_url"`
	Enabled       bool   `json:"enabled"`
	TestMode      bool   `json:"test_mode"`
	PublicKey     string `json:"public_key"`
	SecretKey     string `json:"secret_key"`
	WebhookSecret string `json:"webhook_secret"`
	MerchantID    string `json:"merchant_id"`
	PaymentKey    string `json:"payment_key"`
}

func (s *settingsService) GetPaymentSettings() (*PaymentSettingsView, error) {
	keys := []string{
		"api_base_url",
		"stripe_enabled", "stripe_test_mode", "stripe_public_key", "stripe_secret_key", "stripe_webhook_secret",
		"paypal_enabled", "paypal_test_mode", "paypal_public_key", "paypal_secret_key", "paypal_webhook_id",
		"cryptomus_enabled", "cryptomus_test_mode", "cryptomus_merchant_id", "cryptomus_payment_key",
	}
	rows, err := s.repo.GetByKeys(keys)
	if err != nil {
		return nil, err
	}
	raw := map[string]string{}
	for _, row := range rows {
		raw[row.SettingKey] = row.SettingValue
	}

	base := helper.ResolveAPIBaseURL(raw["api_base_url"])
	view := &PaymentSettingsView{
		APIBaseURL: raw["api_base_url"],
		WebhookURLs: map[string]string{
			"stripe":    base + "/api/v1/payment/stripe/webhook",
			"paypal":    base + "/api/v1/payment/paypal/webhook",
			"cryptomus": base + "/api/v1/payment/cryptomus/webhook",
		},
		Gateways: map[string]PaymentGatewayView{
			"stripe": {
				Enabled:          raw["stripe_enabled"] == "1",
				TestMode:         raw["stripe_test_mode"] == "1",
				PublicKey:        raw["stripe_public_key"],
				HasSecretKey:     strings.TrimSpace(raw["stripe_secret_key"]) != "",
				HasWebhookSecret: strings.TrimSpace(raw["stripe_webhook_secret"]) != "",
			},
			"paypal": {
				Enabled:          raw["paypal_enabled"] == "1",
				TestMode:         raw["paypal_test_mode"] == "1",
				PublicKey:        raw["paypal_public_key"],
				HasSecretKey:     strings.TrimSpace(raw["paypal_secret_key"]) != "",
				HasWebhookSecret: strings.TrimSpace(raw["paypal_webhook_id"]) != "",
			},
			"cryptomus": {
				Enabled:       raw["cryptomus_enabled"] == "1",
				TestMode:      raw["cryptomus_test_mode"] == "1",
				MerchantID:    raw["cryptomus_merchant_id"],
				HasPaymentKey: strings.TrimSpace(raw["cryptomus_payment_key"]) != "",
			},
		},
	}
	if view.APIBaseURL == "" {
		view.APIBaseURL = base
	}
	return view, nil
}

func (s *settingsService) UpdatePaymentSettings(input PaymentGatewayUpdate, adminID uint) error {
	provider := strings.ToLower(strings.TrimSpace(input.Provider))
	if provider != "stripe" && provider != "paypal" && provider != "cryptomus" {
		return ErrPaymentProviderInvalid
	}

	updates := map[string]string{}

	apiBase := strings.TrimSpace(input.APIBaseURL)
	if apiBase != "" {
		if !IsValidAPIBaseURL(apiBase) {
			return ErrPaymentAPIBaseURLInvalid
		}
		updates["api_base_url"] = strings.TrimSuffix(apiBase, "/")
	}

	switch provider {
	case "stripe":
		updates["stripe_enabled"] = bool01(input.Enabled)
		updates["stripe_test_mode"] = bool01(input.TestMode)
		updates["stripe_public_key"] = strings.TrimSpace(input.PublicKey)
		if sk := strings.TrimSpace(input.SecretKey); sk != "" && sk != "********" {
			updates["stripe_secret_key"] = sk
		}
		if wh := strings.TrimSpace(input.WebhookSecret); wh != "" && wh != "********" {
			updates["stripe_webhook_secret"] = wh
		}
	case "paypal":
		updates["paypal_enabled"] = bool01(input.Enabled)
		updates["paypal_test_mode"] = bool01(input.TestMode)
		updates["paypal_public_key"] = strings.TrimSpace(input.PublicKey)
		if sk := strings.TrimSpace(input.SecretKey); sk != "" && sk != "********" {
			updates["paypal_secret_key"] = sk
		}
		if wh := strings.TrimSpace(input.WebhookSecret); wh != "" && wh != "********" {
			updates["paypal_webhook_id"] = wh
		}
	case "cryptomus":
		updates["cryptomus_enabled"] = bool01(input.Enabled)
		updates["cryptomus_test_mode"] = bool01(input.TestMode)
		updates["cryptomus_merchant_id"] = strings.TrimSpace(input.MerchantID)
		if pk := strings.TrimSpace(input.PaymentKey); pk != "" && pk != "********" {
			updates["cryptomus_payment_key"] = pk
		}
	}

	if err := validateSettingsValues(updates); err != nil {
		return err
	}

	merged, err := s.mergePaymentSettings(updates)
	if err != nil {
		return err
	}
	if err := validatePaymentGatewayEnable(merged); err != nil {
		return err
	}
	if err := validateStripeKeyMode(merged); err != nil {
		return err
	}

	return s.persist(updates, adminID, "Payment settings updated ("+provider+")")
}

func (s *settingsService) mergePaymentSettings(updates map[string]string) (map[string]string, error) {
	keys := []string{
		"stripe_enabled", "stripe_test_mode", "stripe_public_key", "stripe_secret_key", "stripe_webhook_secret",
		"paypal_enabled", "paypal_test_mode", "paypal_public_key", "paypal_secret_key", "paypal_webhook_id",
		"cryptomus_enabled", "cryptomus_test_mode", "cryptomus_merchant_id", "cryptomus_payment_key",
	}
	rows, err := s.repo.GetByKeys(keys)
	if err != nil {
		return nil, err
	}
	merged := map[string]string{}
	for _, row := range rows {
		merged[row.SettingKey] = row.SettingValue
	}
	for k, v := range updates {
		merged[k] = v
	}
	return merged, nil
}

func validatePaymentGatewayEnable(merged map[string]string) error {
	if merged["stripe_enabled"] == "1" {
		if strings.TrimSpace(merged["stripe_public_key"]) == "" ||
			strings.TrimSpace(merged["stripe_secret_key"]) == "" ||
			strings.TrimSpace(merged["stripe_webhook_secret"]) == "" {
			return ErrPaymentStripeIncomplete
		}
	}
	if merged["paypal_enabled"] == "1" {
		if strings.TrimSpace(merged["paypal_public_key"]) == "" ||
			strings.TrimSpace(merged["paypal_secret_key"]) == "" ||
			strings.TrimSpace(merged["paypal_webhook_id"]) == "" {
			return ErrPaymentPayPalIncomplete
		}
	}
	if merged["cryptomus_enabled"] == "1" {
		if strings.TrimSpace(merged["cryptomus_merchant_id"]) == "" ||
			strings.TrimSpace(merged["cryptomus_payment_key"]) == "" {
			return ErrPaymentCryptoIncomplete
		}
	}
	return nil
}

func validateStripeKeyMode(merged map[string]string) error {
	pub := strings.TrimSpace(merged["stripe_public_key"])
	sec := strings.TrimSpace(merged["stripe_secret_key"])
	if pub == "" && sec == "" {
		return nil
	}
	if helper.LooksEncryptedSecret(sec) {
		plain, err := helper.DecryptPaymentSecret(sec)
		if err != nil {
			return ErrPaymentSecretDecrypt
		}
		sec = plain
	}
	testMode := merged["stripe_test_mode"] == "1"
	if pub != "" {
		if testMode && !strings.HasPrefix(pub, "pk_test_") {
			return ErrPaymentStripeKeyMode
		}
		if !testMode && !strings.HasPrefix(pub, "pk_live_") {
			return ErrPaymentStripeKeyMode
		}
	}
	if sec != "" {
		if testMode && !strings.HasPrefix(sec, "sk_test_") {
			return ErrPaymentStripeKeyMode
		}
		if !testMode && !strings.HasPrefix(sec, "sk_live_") {
			return ErrPaymentStripeKeyMode
		}
	}
	return nil
}

func bool01(v bool) string {
	if v {
		return "1"
	}
	return "0"
}

// IsValidAPIBaseURL allows https anywhere, or http for localhost/127.0.0.1 only.
func IsValidAPIBaseURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return false
	}
	switch u.Scheme {
	case "https":
		return true
	case "http":
		return host == "localhost" || host == "127.0.0.1"
	default:
		return false
	}
}

// TestPaymentGateway verifies stored credentials can be decrypted.
func (s *settingsService) TestPaymentGateway(provider string) (string, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	view, err := s.GetPaymentSettings()
	if err != nil {
		return "", err
	}
	gw, ok := view.Gateways[provider]
	if !ok {
		return "", ErrPaymentProviderInvalid
	}
	if !gw.Enabled {
		return "", ErrPaymentGatewayDisabled
	}

	need := map[string][]string{
		"stripe":    {"stripe_secret_key", "stripe_webhook_secret"},
		"paypal":    {"paypal_secret_key", "paypal_webhook_id"},
		"cryptomus": {"cryptomus_payment_key"},
	}[provider]
	if need == nil {
		return "", ErrPaymentProviderInvalid
	}
	rows, err := s.repo.GetByKeys(need)
	if err != nil {
		return "", err
	}
	for _, row := range rows {
		val := strings.TrimSpace(row.SettingValue)
		if val == "" {
			return "", fmt.Errorf("missing credential: %s", row.SettingKey)
		}
		if helper.LooksEncryptedSecret(val) {
			if _, err := helper.DecryptPaymentSecret(val); err != nil {
				return "", ErrPaymentSecretDecrypt
			}
		}
	}
	return "Credentials are present and decryptable", nil
}
