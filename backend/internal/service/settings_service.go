package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

var (
	ErrSettingsUnknownKey    = errors.New("unknown or disallowed setting key")
	ErrSettingsInvalidURL    = errors.New("invalid URL")
	ErrSettingsInvalidEmail  = errors.New("invalid email")
	ErrSettingsInvalidColor  = errors.New("invalid hex color")
	ErrSettingsInvalidNav    = errors.New("invalid nav style")
	ErrSettingsInvalidLength = errors.New("setting value exceeds maximum length")
	ErrSettingsTitleRequired = errors.New("site title is required")
	ErrSettingsInvalidJSON   = errors.New("invalid JSON setting value")
	ErrSettingsInvalidFlag   = errors.New("invalid boolean flag value")
)

// paymentEncryptKeys are encrypted at rest on write (JWT_SECRET).
var paymentEncryptKeys = map[string]bool{
	"stripe_secret_key":     true,
	"stripe_webhook_secret": true,
	"paypal_secret_key":     true,
	"paypal_webhook_id":     true,
	"cryptomus_payment_key": true,
}

// BrandSettingKeys are the only keys brand-build may read/write.
var BrandSettingKeys = []string{
	"site_title",
	"site_tagline",
	"logo_url",
	"favicon_url",
	"primary_color",
	"nav_style",
	"support_email",
	"help_center_url",
	"twitter_url",
	"linkedin_url",
	"youtube_url",
	"facebook_url",
	"head_scripts_json",
	"custom_robots_txt",
	"use_custom_robots",
	"google_site_verification",
	"site_base_url",
}

var brandKeySet = func() map[string]bool {
	m := make(map[string]bool, len(BrandSettingKeys))
	for _, k := range BrandSettingKeys {
		m[k] = true
	}
	return m
}()

// WritableSettingKeys is the global allowlist for POST /admin/settings/update.
var WritableSettingKeys = map[string]bool{
	// brand
	"site_title": true, "site_tagline": true, "logo_url": true, "favicon_url": true,
	"primary_color": true, "nav_style": true, "support_email": true, "help_center_url": true,
	"twitter_url": true, "linkedin_url": true, "youtube_url": true, "facebook_url": true,
	"head_scripts_json": true, "custom_robots_txt": true, "use_custom_robots": true,
	"google_site_verification": true, "site_base_url": true,
	// job control
	"chunk_size": true, "task_timeout": true, "task_timeout_minutes": true,
	"max_emails_per_job": true, "max_active_jobs_per_user": true,
	// maintenance / license page
	"maintenance_mode": true, "maintenance_message": true,
	// payment gateways (+ api_base_url for webhook callbacks)
	"api_base_url": true,
	"stripe_enabled": true, "stripe_test_mode": true, "stripe_public_key": true,
	"stripe_secret_key": true, "stripe_webhook_secret": true,
	"paypal_enabled": true, "paypal_test_mode": true, "paypal_public_key": true,
	"paypal_secret_key": true, "paypal_webhook_id": true,
	"cryptomus_enabled": true, "cryptomus_test_mode": true,
	"cryptomus_merchant_id": true, "cryptomus_payment_key": true,
}

// SensitiveSettingKeys are redacted on GetAllSettings responses.
var SensitiveSettingKeys = map[string]bool{
	"stripe_secret_key":        true,
	"stripe_webhook_secret":    true,
	"paypal_secret_key":        true,
	"paypal_webhook_id":        true,
	"cryptomus_payment_key":    true,
	"worker_api_key_encrypted": true,
	"worker_api_key_hash":      true,
	"license_key":              true,
}

var urlSettingKeys = map[string]bool{
	"logo_url": true, "favicon_url": true, "help_center_url": true,
	"twitter_url": true, "linkedin_url": true, "youtube_url": true, "facebook_url": true,
	"site_base_url": true,
}

const (
	maxSiteTitleLen       = 100
	maxSiteTaglineLen     = 200
	maxURLLen             = 2048
	maxEmailLen           = 254
	maxGenericLen         = 2000
	maxCustomRobotsLen    = 10000
	maxHeadScriptsJSONLen = 50000
	maxHeadScriptsCount   = 20
	maxHeadScriptCodeLen  = 20000
	maxHeadScriptNameLen  = 100
)

type headScriptItemDTO struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Code    string `json:"code"`
	Enabled bool   `json:"enabled"`
}

type SettingsService interface {
	GetAllSettings() ([]model.Setting, error)
	GetSettingsByKeys(keys []string) ([]model.Setting, error)
	GetBrandSettings() (map[string]string, error)
	UpdateSettings(updates map[string]string, adminID uint) error
	UpdateBrandSettings(updates map[string]string, adminID uint) error
	GetPaymentSettings() (*PaymentSettingsView, error)
	UpdatePaymentSettings(input PaymentGatewayUpdate, adminID uint) error
	TestPaymentGateway(provider string) (string, error)
}

type settingsService struct {
	repo    repo.SettingsRepo
	logRepo repo.LogRepo
}

func NewSettingsService(repo repo.SettingsRepo, logRepo repo.LogRepo) SettingsService {
	return &settingsService{repo: repo, logRepo: logRepo}
}

func (s *settingsService) GetAllSettings() ([]model.Setting, error) {
	settings, err := s.repo.GetAll()
	if err != nil {
		return nil, err
	}
	MaskSensitiveSettings(settings)
	return settings, nil
}

func (s *settingsService) GetSettingsByKeys(keys []string) ([]model.Setting, error) {
	return s.repo.GetByKeys(keys)
}

func (s *settingsService) GetBrandSettings() (map[string]string, error) {
	rows, err := s.repo.GetByKeys(BrandSettingKeys)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(BrandSettingKeys))
	for _, k := range BrandSettingKeys {
		out[k] = ""
	}
	for _, row := range rows {
		out[row.SettingKey] = row.SettingValue
	}
	if out["site_title"] == "" {
		out["site_title"] = "EmailJachai Pro"
	}
	return out, nil
}

func (s *settingsService) UpdateBrandSettings(updates map[string]string, adminID uint) error {
	filtered := make(map[string]string, len(updates))
	for k, v := range updates {
		if !brandKeySet[k] {
			return fmt.Errorf("%w: %s", ErrSettingsUnknownKey, k)
		}
		filtered[k] = v
	}
	if err := validateSettingsValues(filtered); err != nil {
		return err
	}
	return s.persist(filtered, adminID, "Brand settings updated")
}

func (s *settingsService) UpdateSettings(updates map[string]string, adminID uint) error {
	filtered := make(map[string]string, len(updates))
	for k, v := range updates {
		if !WritableSettingKeys[k] {
			return fmt.Errorf("%w: %s", ErrSettingsUnknownKey, k)
		}
		filtered[k] = v
	}
	if err := validateSettingsValues(filtered); err != nil {
		return err
	}
	// If any payment enable/credential keys are in this batch, enforce completeness.
	if touchesPaymentKeys(filtered) {
		merged, err := s.mergePaymentSettings(filtered)
		if err != nil {
			return err
		}
		if err := validatePaymentGatewayEnable(merged); err != nil {
			return err
		}
		if err := validateStripeKeyMode(merged); err != nil {
			return err
		}
	}
	return s.persist(filtered, adminID, "System settings updated")
}

func touchesPaymentKeys(updates map[string]string) bool {
	for k := range updates {
		if strings.HasPrefix(k, "stripe_") || strings.HasPrefix(k, "paypal_") || strings.HasPrefix(k, "cryptomus_") {
			return true
		}
	}
	return false
}

func (s *settingsService) persist(updates map[string]string, adminID uint, logMsg string) error {
	numericRules := map[string]struct {
		min, max, def int
	}{
		"chunk_size":               {10, 50000, 1000},
		"task_timeout":             {1, 1440, 60},
		"task_timeout_minutes":     {1, 1440, 60},
		"max_emails_per_job":       {10, 1000000, 100000},
		"max_active_jobs_per_user": {0, 10000, 0},
	}

	prepared := make(map[string]string, len(updates)+1)
	changedKeys := make([]string, 0, len(updates))

	for k, v := range updates {
		if paymentEncryptKeys[k] {
			if v == "********" || strings.TrimSpace(v) == "" {
				continue
			}
			enc, err := helper.EncryptPaymentSecret(v)
			if err != nil {
				return err
			}
			v = enc
		}

		if rule, ok := numericRules[k]; ok {
			val, err := strconv.Atoi(v)
			if err != nil {
				val = rule.def
			}
			if val < rule.min {
				val = rule.min
			}
			if val > rule.max {
				val = rule.max
			}
			v = strconv.Itoa(val)
		}

		prepared[k] = v
		changedKeys = append(changedKeys, k)

		if k == "task_timeout" {
			prepared["task_timeout_minutes"] = v
		}
	}

	if err := s.repo.UpdateMany(prepared); err != nil {
		return err
	}

	detail := logMsg
	if len(changedKeys) > 0 {
		detail = fmt.Sprintf("%s (%s)", logMsg, strings.Join(changedKeys, ", "))
	}
	s.logActivity("INFO", "Admin", detail, adminID)
	return nil
}

func validateSettingsValues(updates map[string]string) error {
	for k, v := range updates {
		v = strings.TrimSpace(v)
		updates[k] = v

		switch k {
		case "site_title":
			if v == "" {
				return ErrSettingsTitleRequired
			}
			if utf8.RuneCountInString(v) > maxSiteTitleLen {
				return fmt.Errorf("%w: site_title", ErrSettingsInvalidLength)
			}
		case "site_tagline":
			if utf8.RuneCountInString(v) > maxSiteTaglineLen {
				return fmt.Errorf("%w: site_tagline", ErrSettingsInvalidLength)
			}
		case "support_email":
			if v != "" {
				if utf8.RuneCountInString(v) > maxEmailLen || !isValidEmail(v) {
					return ErrSettingsInvalidEmail
				}
			}
		case "primary_color":
			if v != "" && !isValidHexColor(v) {
				return ErrSettingsInvalidColor
			}
		case "nav_style":
			if v != "" && v != "dark" && v != "light" {
				return ErrSettingsInvalidNav
			}
		case "maintenance_message":
			if utf8.RuneCountInString(v) > maxGenericLen {
				return fmt.Errorf("%w: maintenance_message", ErrSettingsInvalidLength)
			}
		case "api_base_url":
			if v != "" {
				if utf8.RuneCountInString(v) > maxURLLen || !IsValidAPIBaseURL(v) {
					return ErrPaymentAPIBaseURLInvalid
				}
			}
		case "use_custom_robots":
			normalized, err := normalizeBoolFlag(v)
			if err != nil {
				return fmt.Errorf("%w: use_custom_robots", ErrSettingsInvalidFlag)
			}
			updates[k] = normalized
		case "custom_robots_txt":
			if utf8.RuneCountInString(v) > maxCustomRobotsLen {
				return fmt.Errorf("%w: custom_robots_txt", ErrSettingsInvalidLength)
			}
		case "head_scripts_json":
			normalized, err := validateHeadScriptsJSON(v)
			if err != nil {
				return err
			}
			updates[k] = normalized
		case "google_site_verification":
			if utf8.RuneCountInString(v) > 200 {
				return fmt.Errorf("%w: google_site_verification", ErrSettingsInvalidLength)
			}
		}

		if urlSettingKeys[k] && v != "" {
			if utf8.RuneCountInString(v) > maxURLLen || !IsValidHTTPURL(v) {
				return fmt.Errorf("%w: %s", ErrSettingsInvalidURL, k)
			}
		}
	}
	return nil
}

func normalizeBoolFlag(v string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return "1", nil
	case "0", "false", "no", "off", "":
		return "0", nil
	default:
		return "", ErrSettingsInvalidFlag
	}
}

func validateHeadScriptsJSON(raw string) (string, error) {
	if raw == "" {
		return "[]", nil
	}
	if len(raw) > maxHeadScriptsJSONLen {
		return "", fmt.Errorf("%w: head_scripts_json", ErrSettingsInvalidLength)
	}

	var items []headScriptItemDTO
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return "", fmt.Errorf("%w: head_scripts_json", ErrSettingsInvalidJSON)
	}
	if len(items) > maxHeadScriptsCount {
		return "", fmt.Errorf("%w: head_scripts_json (max %d items)", ErrSettingsInvalidLength, maxHeadScriptsCount)
	}

	cleaned := make([]headScriptItemDTO, 0, len(items))
	for i, item := range items {
		id := strings.TrimSpace(item.ID)
		name := strings.TrimSpace(item.Name)
		code := strings.TrimSpace(item.Code)
		if id == "" {
			id = fmt.Sprintf("script-%d", i+1)
		}
		if name == "" {
			return "", fmt.Errorf("%w: head_scripts_json name required", ErrSettingsInvalidJSON)
		}
		if utf8.RuneCountInString(name) > maxHeadScriptNameLen {
			return "", fmt.Errorf("%w: head_scripts_json name", ErrSettingsInvalidLength)
		}
		if utf8.RuneCountInString(code) > maxHeadScriptCodeLen {
			return "", fmt.Errorf("%w: head_scripts_json code", ErrSettingsInvalidLength)
		}
		cleaned = append(cleaned, headScriptItemDTO{
			ID:      id,
			Name:    name,
			Code:    code,
			Enabled: item.Enabled,
		})
	}

	out, err := json.Marshal(cleaned)
	if err != nil {
		return "", fmt.Errorf("%w: head_scripts_json", ErrSettingsInvalidJSON)
	}
	if len(out) > maxHeadScriptsJSONLen {
		return "", fmt.Errorf("%w: head_scripts_json", ErrSettingsInvalidLength)
	}
	return string(out), nil
}

// IsValidHTTPURL accepts https URLs with a non-empty host (ports, paths, query OK).
// http is rejected so saved logo/favicon URLs match production CSP img-src https:.
func IsValidHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "https" {
		return false
	}
	if u.Host == "" || u.Hostname() == "" {
		return false
	}
	return true
}

func isValidHexColor(v string) bool {
	if len(v) != 4 && len(v) != 7 {
		return false
	}
	if v[0] != '#' {
		return false
	}
	for _, c := range v[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func isValidEmail(v string) bool {
	addr, err := mail.ParseAddress(v)
	if err != nil {
		return false
	}
	return addr.Address == v
}

// MaskSensitiveSettings redacts secret values in-place for API responses.
// Empty string (not ********) so clients never bind a fake secret into password inputs.
func MaskSensitiveSettings(settings []model.Setting) {
	for i := range settings {
		if SensitiveSettingKeys[settings[i].SettingKey] && settings[i].SettingValue != "" {
			settings[i].SettingValue = ""
		}
	}
}

func (s *settingsService) logActivity(level, source, message string, adminID uint) {
	log := &model.ActivityLog{
		UserID:  &adminID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	_ = s.logRepo.Create(log)
}
