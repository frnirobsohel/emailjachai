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

// SafeIANATimezone returns name if it looks like a valid IANA id, otherwise "UTC".
// Used only for embedding into SQL AT TIME ZONE literals (never user input).
func SafeIANATimezone(name string) string {
	if name == "" {
		return "UTC"
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		ok := (c >= 'a' && c <= 'z') ||
			(c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') ||
			c == '/' || c == '_' || c == '-' || c == '+'
		if !ok {
			return "UTC"
		}
	}
	if _, err := time.LoadLocation(name); err != nil {
		return "UTC"
	}
	return name
}

// ResolveLocation picks a timezone for dashboard day buckets.
// Prefer client-provided IANA name; otherwise fall back to APP_TIMEZONE / UTC.
func ResolveLocation(tzQuery string) (*time.Location, string) {
	if tzQuery == "" {
		loc := AppLocation()
		return loc, SafeIANATimezone(loc.String())
	}
	safe := SafeIANATimezone(tzQuery)
	loc, err := time.LoadLocation(safe)
	if err != nil {
		return time.UTC, "UTC"
	}
	return loc, safe
}
