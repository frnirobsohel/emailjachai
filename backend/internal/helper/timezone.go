package helper

import (
	"os"
	"time"
)

// AppLocation returns the application timezone from APP_TIMEZONE (default UTC).
func AppLocation() *time.Location {
	name := os.Getenv("APP_TIMEZONE")
	if name == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// StartOfDayInAppTZ returns the start of "today" in the app timezone, as UTC
// for comparing against timestamptz / UTC-naive timestamp columns.
func StartOfDayInAppTZ(t time.Time) time.Time {
	loc := AppLocation()
	local := t.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	return start.UTC()
}
