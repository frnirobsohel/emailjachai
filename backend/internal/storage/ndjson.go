// Package storage implements Section 4 of ENGINEERING_ARCHITECTURE.md:
// "Store Bulk Results as .ndjson files. When a user downloads results,
// the system serves the file directly instead of querying billions of rows from SQL."
package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ResultRow is the NDJSON record written per email result.
// Matches legacy PHP NDJSON format for full parity.
type ResultRow struct {
	JobID          string    `json:"job_id"`
	Email          string    `json:"email"`
	Status         string    `json:"status"`
	Score          int       `json:"score"`
	Reason         string    `json:"reason"`
	IsCatchAll     bool      `json:"catch_all"`
	IsDeliverable  bool      `json:"deliverable"`
	IsDisposable   bool      `json:"disposable"`
	IsFree         bool      `json:"free"`
	IsRole         bool      `json:"role"`
	HasMx          bool      `json:"has_mx"`
	SmtpConnect    bool      `json:"smtp_connect"`
	IsSpamTrap     bool      `json:"spam_trap"`
	IsBlacklisted  bool      `json:"blacklisted"`
	MailboxFull    bool      `json:"mailbox_full"`
	IsSyntaxValid  bool      `json:"syntax_valid"`
	ProcessingTime float64   `json:"processing_time"`
	VerifiedAt     time.Time `json:"verified_at"`
}

// mu guards file handles to prevent concurrent corruption on the same path.
var mu sync.Mutex

// BulkJobFilePath returns the canonical path for a bulk job's ndjson results file.
// Pattern: {BULK_JOBS_PATH}/{jobID}.ndjson
func BulkJobFilePath(basePath, jobID string) string {
	return filepath.Join(basePath, jobID+".ndjson")
}

// EnsureDir creates the storage directory if it doesn't already exist.
func EnsureDir(path string) error {
	return os.MkdirAll(path, 0750)
}

// AppendResult appends a single result row to the job's ndjson file.
// Uses file-level locking for safe concurrent writes.
// Returns the absolute path of the file written.
func AppendResult(basePath, jobID string, row ResultRow) (string, error) {
	if err := EnsureDir(basePath); err != nil {
		return "", fmt.Errorf("storage: mkdir failed: %w", err)
	}

	filePath := BulkJobFilePath(basePath, jobID)

	line, err := json.Marshal(row)
	if err != nil {
		return "", fmt.Errorf("storage: marshal failed: %w", err)
	}
	line = append(line, '\n')

	mu.Lock()
	defer mu.Unlock()

	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return "", fmt.Errorf("storage: open file failed: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(line); err != nil {
		return "", fmt.Errorf("storage: write failed: %w", err)
	}

	return filePath, nil
}

// AppendBatch appends multiple result rows in a single file open operation.
// More efficient than calling AppendResult in a loop for batch workers.
func AppendBatch(basePath, jobID string, rows []ResultRow) (string, error) {
	if len(rows) == 0 {
		return "", nil
	}
	if err := EnsureDir(basePath); err != nil {
		return "", fmt.Errorf("storage: mkdir failed: %w", err)
	}

	filePath := BulkJobFilePath(basePath, jobID)

	mu.Lock()
	defer mu.Unlock()

	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0640)
	if err != nil {
		return "", fmt.Errorf("storage: open file failed: %w", err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	for _, row := range rows {
		if err := enc.Encode(row); err != nil {
			return filePath, fmt.Errorf("storage: encode failed: %w", err)
		}
	}

	return filePath, nil
}

// DeleteJobFile removes the ndjson file for a deleted job.
func DeleteJobFile(basePath, jobID string) error {
	path := BulkJobFilePath(basePath, jobID)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// FileExists reports whether the ndjson file for a job exists.
func FileExists(basePath, jobID string) bool {
	_, err := os.Stat(BulkJobFilePath(basePath, jobID))
	return err == nil
}
