// Package report provides centralized export generators for verification results.
//
// Supported formats:
//   - CSV  : streaming, memory-efficient, UTF-8 BOM for Excel compatibility
//   - NDJSON: newline-delimited JSON (native storage format, zero conversion)
//
// All writers implement io.WriterTo so they can be plugged directly into
// http.ResponseWriter, os.File, or any io.Writer.
//
// Usage in a Gin handler:
//
//	w := report.NewCSVWriter(rows, jobID)
//	c.Header("Content-Type", "text/csv; charset=utf-8")
//	c.Header("Content-Disposition", `attachment; filename="results.csv"`)
//	w.WriteTo(c.Writer)
package report

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

// ResultRow is the canonical in-memory representation of a single verification
// result. Both the DB-scan fallback and the NDJSON streaming path populate
// this struct before passing it to any Writer.
type ResultRow struct {
	Email      string    `json:"email"`
	Status     string    `json:"status"`
	Reason     string    `json:"reason"`
	IsCatchAll bool      `json:"is_catch_all"`
	Score      int       `json:"score"`
	VerifiedAt time.Time `json:"verified_at"`
	JobID      string    `json:"job_id"`
	MxRecords  []string  `json:"mx_records,omitempty"`
}

// RowSource is any iterator that can produce ResultRows one at a time.
// Implementations: DBRowSource (wraps *sql.Rows), NDJSONRowSource (wraps *os.File).
type RowSource interface {
	// Next advances to the next row. Returns false when exhausted or on error.
	Next() bool
	// Row returns the current row. Only valid after a successful Next() call.
	Row() ResultRow
	// Err returns any error that stopped iteration.
	Err() error
	// Close releases resources held by the source.
	Close() error
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Writer
// ─────────────────────────────────────────────────────────────────────────────

// csvHeader defines the column order for all exported CSV files.
var csvHeader = []string{
	"Domain", "Email", "Status", "Score", "MX Record", "Reason", "Verified At", "Job ID",
}

// GetFriendlyReason translates a technical reason code into a user-friendly description.
// Wording hints whether the failure is usually our verifier host vs the recipient MX.
func GetFriendlyReason(reasonCode string, status string) string {
	switch reasonCode {
	case "syntax":
		return "Invalid Email Syntax (Format error)"
	case "mx":
		return "No MX Records found for domain"
	case "no_mail":
		return "No mail service (parked or web-only domain)"
	case "disposable":
		return "Disposable Email Provider (Temporary mail)"
	case "spamtrap":
		return "Spam Trap Address"
	case "blacklist":
		return "Blacklisted Domain/IP"
	case "rejected":
		return "Mailbox does not exist (Recipient rejected)"
	case "mailbox_full":
		return "Mailbox is full / Storage limit exceeded"
	case "catch_all":
		return "Catch-all Domain (Accepts all incoming mail)"
	case "accepted":
		return "Deliverable — mailbox accepted by SMTP"
	case "smtp_unreachable":
		// Dial/handshake never completed — common when our VPS blocks outbound :25,
		// or the recipient MX is down / firewalled.
		return "No SMTP connection — check our outbound port 25, or recipient MX is down/blocking"
	case "smtp_inconclusive":
		return "SMTP connected but no clear mailbox answer — usually recipient greylist/policy"
	case "smtp":
		// Legacy rows before smtp_unreachable / smtp_inconclusive split.
		return "SMTP probe failed — if many rows say this, check our outbound port 25"
	case "rate_limit_timeout":
		return "Verification timed out waiting on our per-domain rate limit"
	case "temp_fail":
		return "Recipient mail server greylisted or temporarily deferred the check"
	case "timeout":
		return "Verification deadline exceeded before a clear SMTP answer"
	case "private_mx":
		return "MX resolves only to private/blocked IPs — cannot probe from the public internet"
	case "catchall_inconclusive":
		return "Catch-all probe inconclusive (recipient greylisted the random check)"
	case "cancelled":
		return "Verification cancelled"
	case "worker":
		if status == "valid" {
			return "Deliverable (Valid Inbox)"
		}
		return "Processed by worker"
	case "":
		if status == "valid" {
			return "Deliverable (Valid Inbox)"
		}
		return "Deliverable"
	default:
		return reasonCode
	}
}

// GetDomainFromEmail extracts the domain part of an email address.
func GetDomainFromEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) == 2 {
		return parts[1]
	}
	return ""
}

// CSVWriter streams verification results as a UTF-8 CSV with BOM.
type CSVWriter struct {
	source RowSource
}

// NewCSVWriter wraps a RowSource in a streaming CSV writer.
func NewCSVWriter(source RowSource) *CSVWriter {
	return &CSVWriter{source: source}
}

// WriteTo streams the entire result set as CSV into w.
// It flushes after every row to allow progressive download by the client.
// Returns the total bytes written and any error encountered.
func (cw *CSVWriter) WriteTo(w io.Writer) (int64, error) {
	defer cw.source.Close()

	// UTF-8 BOM — required for Excel to auto-detect encoding on Windows.
	n, err := w.Write([]byte("\xEF\xBB\xBF"))
	total := int64(n)
	if err != nil {
		return total, fmt.Errorf("report/csv: failed to write BOM: %w", err)
	}

	bw := bufio.NewWriterSize(w, 64*1024) // 64 KB write buffer
	cw2 := csv.NewWriter(bw)

	if err := cw2.Write(csvHeader); err != nil {
		return total, fmt.Errorf("report/csv: failed to write header: %w", err)
	}

	for cw.source.Next() {
		row := cw.source.Row()
		domain := GetDomainFromEmail(row.Email)
		mxRecordsStr := strings.Join(row.MxRecords, "; ")
		friendlyReason := GetFriendlyReason(row.Reason, row.Status)

		if err := cw2.Write([]string{
			domain,
			row.Email,
			row.Status,
			fmt.Sprintf("%d", row.Score),
			mxRecordsStr,
			friendlyReason,
			row.VerifiedAt.Format("2006-01-02 15:04:05"),
			row.JobID,
		}); err != nil {
			return total, fmt.Errorf("report/csv: failed to write row: %w", err)
		}
		cw2.Flush()
		if err := bw.Flush(); err != nil {
			return total, fmt.Errorf("report/csv: flush error: %w", err)
		}
	}

	if err := cw.source.Err(); err != nil {
		return total, fmt.Errorf("report/csv: source error: %w", err)
	}
	return total, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// NDJSON Writer
// ─────────────────────────────────────────────────────────────────────────────

// NDJSONWriter streams verification results as Newline-Delimited JSON.
type NDJSONWriter struct {
	source RowSource
}

// NewNDJSONWriter wraps a RowSource in a streaming NDJSON writer.
func NewNDJSONWriter(source RowSource) *NDJSONWriter {
	return &NDJSONWriter{source: source}
}

// WriteTo streams the entire result set as NDJSON into w.
func (nw *NDJSONWriter) WriteTo(w io.Writer) (int64, error) {
	defer nw.source.Close()

	bw := bufio.NewWriterSize(w, 64*1024)
	enc := json.NewEncoder(bw)
	var total int64

	for nw.source.Next() {
		row := nw.source.Row()
		if err := enc.Encode(row); err != nil {
			return total, fmt.Errorf("report/ndjson: encode error: %w", err)
		}
		if err := bw.Flush(); err != nil {
			return total, fmt.Errorf("report/ndjson: flush error: %w", err)
		}
	}

	if err := nw.source.Err(); err != nil {
		return total, fmt.Errorf("report/ndjson: source error: %w", err)
	}
	return total, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename helpers
// ─────────────────────────────────────────────────────────────────────────────

// CSVFilename returns the standard download filename for a job's CSV export.
func CSVFilename(jobID string) string {
	return fmt.Sprintf("results_%s.csv", jobID)
}

// NDJSONFilename returns the standard download filename for a job's NDJSON export.
func NDJSONFilename(jobID string) string {
	return fmt.Sprintf("results_%s.ndjson", jobID)
}
