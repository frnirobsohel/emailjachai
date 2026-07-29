package helper

import (
	"testing"
	"time"
)

func TestAppLocation_DefaultUTC(t *testing.T) {
	t.Setenv("APP_TIMEZONE", "")
	if AppLocation() != time.UTC {
		t.Fatalf("expected UTC for empty APP_TIMEZONE, got %v", AppLocation())
	}
}

func TestAppLocation_InvalidFallsBackToUTC(t *testing.T) {
	t.Setenv("APP_TIMEZONE", "Not/ARealZone")
	if AppLocation() != time.UTC {
		t.Fatalf("expected UTC for invalid zone, got %v", AppLocation())
	}
}

func TestStartOfDayInAppTZ_UTC(t *testing.T) {
	t.Setenv("APP_TIMEZONE", "UTC")
	input := time.Date(2026, 7, 28, 15, 30, 0, 0, time.UTC)
	got := StartOfDayInAppTZ(input)
	want := time.Date(2026, 7, 28, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("StartOfDayInAppTZ() = %v, want %v", got, want)
	}
}

func TestStartOfDayInAppTZ_AsiaDhaka(t *testing.T) {
	t.Setenv("APP_TIMEZONE", "Asia/Dhaka")
	input := time.Date(2026, 7, 28, 22, 0, 0, 0, time.UTC)
	got := StartOfDayInAppTZ(input)
	dhaka, err := time.LoadLocation("Asia/Dhaka")
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 7, 29, 0, 0, 0, 0, dhaka).UTC()
	if !got.Equal(want) {
		t.Fatalf("StartOfDayInAppTZ() = %v, want %v", got, want)
	}
}

func TestResolveLocation_UsesQuery(t *testing.T) {
	loc, name := ResolveLocation("America/New_York")
	if name != "America/New_York" {
		t.Fatalf("name = %q", name)
	}
	if loc.String() != "America/New_York" {
		t.Fatalf("loc = %v", loc)
	}
}

func TestResolveLocation_EmptyFallsBackToApp(t *testing.T) {
	t.Setenv("APP_TIMEZONE", "UTC")
	_, name := ResolveLocation("")
	if name != "UTC" {
		t.Fatalf("expected UTC fallback, got %q", name)
	}
}

func TestSafeIANATimezone(t *testing.T) {
	if SafeIANATimezone("Asia/Dhaka") != "Asia/Dhaka" {
		t.Fatalf("expected Asia/Dhaka")
	}
	if SafeIANATimezone("UTC") != "UTC" {
		t.Fatalf("expected UTC")
	}
	if SafeIANATimezone("bad;drop") != "UTC" {
		t.Fatalf("expected fallback UTC for unsafe name")
	}
	if SafeIANATimezone("Not/ARealZone") != "UTC" {
		t.Fatalf("expected fallback UTC for unknown zone")
	}
}
