package handler

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"ejp-backend/internal/repo"
	"ejp-backend/internal/storage"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/report"

	"github.com/gin-gonic/gin"
)

// DownloadJobResults streams bulk job results.
//
// Architecture Section 4: "When a user downloads results, the system serves
// the file directly instead of querying billions of rows from SQL."
//
// Strategy:
//  1. If job.ResultFilePath points to an existing .ndjson file → stream it directly.
//  2. Fallback → query job_results table (for backwards compatibility / small jobs).
func (h *JobHandler) DownloadJobResults(c *gin.Context) {
	userID, _ := c.Get("userID")

	// Legacy support for both jobId and job_id query params
	jobIDStr := c.Query("jobId")
	if jobIDStr == "" {
		jobIDStr = c.Query("job_id")
	}

	format := c.Query("format")
	if format == "" {
		format = "csv"
	}

	if jobIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Job ID is required"})
		return
	}

	// 1. Find Job (support both string JobID and numeric ID)
	job, err := h.jobService.GetJobForUser(userID.(uint), jobIDStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	// 2. Determine base path for ndjson files
	basePath := os.Getenv("BULK_RESULTS_PATH")
	if basePath == "" {
		basePath = "./storage/results/bulk"
	}

	// 3. File-first strategy: serve ndjson file directly if it exists
	fileExists := storage.FileExists(basePath, job.JobID)
	if job.ResultFilePath == "" && fileExists {
		// Back-fill the path in case it wasn't recorded in DB
		job.ResultFilePath = storage.BulkJobFilePath(basePath, job.JobID)
	}

	if fileExists {
		ndjsonPath := storage.BulkJobFilePath(basePath, job.JobID)

		switch format {
		case "ndjson":
			c.Header("Content-Type", "application/x-ndjson")
			c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="results_%s.ndjson"`, job.JobID))
			c.File(ndjsonPath)
			return

		case "csv":
			// Stream ndjson → csv conversion without loading entire file into memory
			c.Header("Content-Type", "text/csv; charset=utf-8")
			c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="results_%s.csv"`, job.JobID))
			// UTF-8 BOM for Excel compatibility (Legacy parity)
			c.Writer.Write([]byte("\xEF\xBB\xBF"))

			f, err := os.Open(ndjsonPath)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open result file"})
				return
			}
			defer f.Close()

			w := csv.NewWriter(c.Writer)
			w.Write([]string{"Domain", "Email", "Status", "Score", "MX Record", "Reason", "Verified At", "Job ID"})

			scanner := bufio.NewScanner(f)
			// Allow lines up to 1MB (large JSON objects are rare but possible)
			scanner.Buffer(make([]byte, 64*1024), 1*1024*1024)
			for scanner.Scan() {
				if c.Request.Context().Err() != nil {
					return
				}
				var row storage.ResultRow
				if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
					continue
				}
				domain := report.GetDomainFromEmail(row.Email)
				mxRecordsStr := strings.Join(row.MxRecords, "; ")
				friendlyReason := report.GetFriendlyReason(row.Reason, row.Status)

				w.Write([]string{
					domain,
					row.Email,
					row.Status,
					fmt.Sprintf("%d", row.Score),
					mxRecordsStr,
					friendlyReason,
					row.VerifiedAt.Format("2006-01-02 15:04:05"),
					job.JobID,
				})
				w.Flush()
			}
			if err := scanner.Err(); err != nil {
				logger.Error("Error reading ndjson file during download", "error", err, "job_id", job.JobID)
			}
			return
		}
	}

	// 4. Fallback: query job_results table (small jobs / single verify / legacy data)
	rows, err := h.jobService.GetJobResultsRows(job.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve results"})
		return
	}
	defer rows.Close()

	switch format {
	case "csv":
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="results_%s.csv"`, job.JobID))
		// UTF-8 BOM for Excel compatibility (Legacy parity)
		c.Writer.Write([]byte("\xEF\xBB\xBF"))

		writer := csv.NewWriter(c.Writer)
		writer.Write([]string{"Domain", "Email", "Status", "Score", "MX Record", "Reason", "Verified At", "Job ID"})

		for rows.Next() {
			if c.Request.Context().Err() != nil {
				return
			}
			var res repo.DownloadResultRow
			if err := rows.Scan(&res.Email, &res.Status, &res.Reason, &res.IsCatchAll, &res.Score, &res.CreatedAt, &res.MxRecordsRaw); err != nil {
				continue
			}

			domain := report.GetDomainFromEmail(res.Email)
			var mxRecords []string
			if len(res.MxRecordsRaw) > 0 {
				_ = json.Unmarshal(res.MxRecordsRaw, &mxRecords)
			}
			mxRecordsStr := strings.Join(mxRecords, "; ")
			friendlyReason := report.GetFriendlyReason(res.Reason, res.Status)

			writer.Write([]string{
				domain,
				res.Email,
				res.Status,
				fmt.Sprintf("%d", res.Score),
				mxRecordsStr,
				friendlyReason,
				res.CreatedAt.Format("2006-01-02 15:04:05"),
				job.JobID,
			})
			writer.Flush()
		}

	case "ndjson":
		c.Header("Content-Type", "application/x-ndjson")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="results_%s.ndjson"`, job.JobID))

		encoder := json.NewEncoder(c.Writer)
		for rows.Next() {
			if c.Request.Context().Err() != nil {
				return
			}
			var res repo.DownloadResultRow
			if err := rows.Scan(&res.Email, &res.Status, &res.Reason, &res.IsCatchAll, &res.Score, &res.CreatedAt, &res.MxRecordsRaw); err != nil {
				continue
			}
			var mxRecords []string
			if len(res.MxRecordsRaw) > 0 {
				_ = json.Unmarshal(res.MxRecordsRaw, &mxRecords)
			}
			encoder.Encode(gin.H{
				"email":       res.Email,
				"status":      res.Status,
				"score":       res.Score,
				"catch_all":   res.IsCatchAll,
				"reason":      res.Reason,
				"mx_records":  mxRecords,
				"verified_at": res.CreatedAt.Format("2006-01-02 15:04:05"),
			})
			c.Writer.Flush()
		}

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format. Use csv or ndjson."})
	}
}
