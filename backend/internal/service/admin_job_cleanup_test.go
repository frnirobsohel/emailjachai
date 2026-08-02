package service

import (
	"errors"
	"testing"
)

func TestCleanupJobsRejectsInvalidDays(t *testing.T) {
	svc := &adminService{}
	for _, days := range []int{-7, 0, 1, 6, 8, 15, 31, 365} {
		_, _, err := svc.CleanupJobs(days)
		if !errors.Is(err, ErrAdminCleanupDays) {
			t.Fatalf("days=%d: want ErrAdminCleanupDays, got %v", days, err)
		}
	}
}

func TestAdminDownloadAllJobsValidation(t *testing.T) {
	svc := &adminService{}

	_, err := svc.AdminDownloadAllJobs("nope", 90)
	if !errors.Is(err, ErrAdminDownloadType) {
		t.Fatalf("bad type: want ErrAdminDownloadType, got %v", err)
	}

	_, err = svc.AdminDownloadAllJobs("bulk", 0)
	if !errors.Is(err, ErrAdminDownloadDays) {
		t.Fatalf("days=0: want ErrAdminDownloadDays, got %v", err)
	}

	_, err = svc.AdminDownloadAllJobs("bulk", 366)
	if !errors.Is(err, ErrAdminDownloadDays) {
		t.Fatalf("days=366: want ErrAdminDownloadDays, got %v", err)
	}
}
