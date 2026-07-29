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
	// 2026-07-28 22:00 UTC == 2026-07-29 04:00 in Dhaka → "today" is July 29 local
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
