package config

import (
	"testing"
)

func TestValidateProductionConfigSkipsNonProd(t *testing.T) {
	t.Setenv("GO_ENV", "development")
	t.Setenv("ENVIRONMENT", "")
	t.Setenv("CORS_ORIGINS", "")
	t.Setenv("FRONTEND_URL", "")
	// Must not exit — just return.
	ValidateProductionConfig()
}

func TestIsProductionEnv(t *testing.T) {
	t.Setenv("GO_ENV", "production")
	t.Setenv("ENVIRONMENT", "")
	if !isProductionEnv() {
		t.Fatal("expected production from GO_ENV")
	}
	t.Setenv("GO_ENV", "")
	t.Setenv("ENVIRONMENT", "production")
	if !isProductionEnv() {
		t.Fatal("expected production from ENVIRONMENT")
	}
	t.Setenv("GO_ENV", "development")
	t.Setenv("ENVIRONMENT", "")
	if isProductionEnv() {
		t.Fatal("expected non-production")
	}
}
