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
	"Email", "Status", "Reason", "Catch-All", "Score", "Verified At", "Job ID",
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
		catchAll := "No"
		if row.IsCatchAll {
			catchAll = "Yes"
		}
		if err := cw2.Write([]string{
			row.Email,
			row.Status,
			row.Reason,
			catchAll,
			fmt.Sprintf("%d", row.Score),
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
