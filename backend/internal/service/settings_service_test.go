package service

import "testing"

func TestIsValidHTTPURL(t *testing.T) {
	tests := []struct {
		raw  string
		want bool
	}{
		{"https://cdn.example.com/logo.png", true},
		{"https://example.com:8443/path?x=1", true},
		{"http://cdn.example.com/logo.png", false},
		{"javascript:alert(1)", false},
		{"data:text/html,hi", false},
		{"/logo.svg", false},
		{"", false},
		{"https://", false},
		{"not-a-url", false},
	}
	for _, tt := range tests {
		if got := IsValidHTTPURL(tt.raw); got != tt.want {
			t.Errorf("IsValidHTTPURL(%q) = %v, want %v", tt.raw, got, tt.want)
		}
	}
}

func TestIsValidEmail(t *testing.T) {
	if !isValidEmail("support@example.com") {
		t.Fatal("expected valid email")
	}
	if isValidEmail("not-an-email") {
		t.Fatal("expected invalid email")
	}
	if isValidEmail("Name <support@example.com>") {
		t.Fatal("display-name form should be rejected")
	}
}

func TestBrandKeyAllowlist(t *testing.T) {
	if !brandKeySet["support_email"] {
		t.Fatal("support_email must be a brand key")
	}
	if brandKeySet["stripe_secret_key"] {
		t.Fatal("stripe_secret_key must not be a brand key")
	}
	if brandKeySet["primary_color"] {
		t.Fatal("primary_color is not on the brand-build allowlist")
	}
}

func TestValidateSettingsValues_TitleRequired(t *testing.T) {
	err := validateSettingsValues(map[string]string{"site_title": ""})
	if err != ErrSettingsTitleRequired {
		t.Fatalf("got %v, want ErrSettingsTitleRequired", err)
	}
}

func TestValidateSettingsValues_HTTPSOnly(t *testing.T) {
	err := validateSettingsValues(map[string]string{
		"site_title": "Demo",
		"logo_url":   "http://example.com/logo.png",
	})
	if err == nil {
		t.Fatal("expected http logo_url to fail")
	}
}
