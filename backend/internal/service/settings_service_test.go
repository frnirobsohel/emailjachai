package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

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
	if !brandKeySet["primary_color"] || !brandKeySet["nav_style"] {
		t.Fatal("primary_color and nav_style must be brand keys")
	}
	if !brandKeySet["head_scripts_json"] || !brandKeySet["custom_robots_txt"] {
		t.Fatal("head scripts / robots keys must be brand keys")
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

func TestValidateHeadScriptsJSON(t *testing.T) {
	ok, err := validateHeadScriptsJSON(`[{"id":"1","name":"Pixel","code":"<script>fbq()</script>","enabled":true}]`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(ok, `"Pixel"`) {
		t.Fatalf("expected normalized JSON, got %s", ok)
	}

	if _, err := validateHeadScriptsJSON(`{not-json}`); err == nil {
		t.Fatal("expected invalid JSON to fail")
	}

	tooMany := make([]headScriptItemDTO, maxHeadScriptsCount+1)
	for i := range tooMany {
		tooMany[i] = headScriptItemDTO{ID: fmt.Sprintf("%d", i), Name: "x", Code: "y", Enabled: true}
	}
	raw, _ := json.Marshal(tooMany)
	if _, err := validateHeadScriptsJSON(string(raw)); err == nil {
		t.Fatal("expected too many scripts to fail")
	}
}

func TestNormalizeBoolFlag(t *testing.T) {
	v, err := normalizeBoolFlag("true")
	if err != nil || v != "1" {
		t.Fatalf("got %q %v", v, err)
	}
	v, err = normalizeBoolFlag("0")
	if err != nil || v != "0" {
		t.Fatalf("got %q %v", v, err)
	}
	if _, err := normalizeBoolFlag("maybe"); err == nil {
		t.Fatal("expected invalid flag")
	}
}

func TestValidateCustomRobotsLength(t *testing.T) {
	long := strings.Repeat("a", maxCustomRobotsLen+1)
	err := validateSettingsValues(map[string]string{
		"site_title":        "Demo",
		"custom_robots_txt": long,
	})
	if err == nil {
		t.Fatal("expected custom_robots_txt length error")
	}
}
