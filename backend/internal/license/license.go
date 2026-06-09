package license

import (
	"errors"
	"strings"
	"time"
)

type LicenseInfo struct {
	Key       string
	Status    string
	ExpiresAt time.Time
}

func ValidateLicense(key string) (*LicenseInfo, error) {
	if key == "" {
		return nil, errors.New("license key required")
	}

	// Validate format: XXXX-XXXX-XXXX-XXXX
	parts := strings.Split(key, "-")
	if len(parts) != 4 {
		return nil, errors.New("invalid license key format. Expected XXXX-XXXX-XXXX-XXXX")
	}
	for _, part := range parts {
		if len(part) != 4 {
			return nil, errors.New("invalid license key format. Expected XXXX-XXXX-XXXX-XXXX")
		}
		for _, char := range part {
			if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')) {
				return nil, errors.New("invalid characters in license key. Only alphanumeric characters allowed")
			}
		}
	}
	
	return &LicenseInfo{
		Key:       key,
		Status:    "active",
		ExpiresAt: time.Now().AddDate(1, 0, 0), // 1 year from now
	}, nil
}
