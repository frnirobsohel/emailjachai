package queue

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"ejp-worker/internal/engine"
	"ejp-worker/internal/jobcontrol"
	"ejp-worker/internal/reporter"
	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"
	"ejp-worker/pkg/safe"

	"github.com/hibiken/asynq"
	"go.uber.org/zap"
)

var (
	webhookClient = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
		},
	}
)

type EmailTaskPayload struct {
	JobID  string `json:"job_id"`
	TaskID uint   `json:"task_id"`
	Email  string `json:"email"`
}

type EmailChunkTaskPayload struct {
	JobID           string   `json:"job_id"`
	TaskID          uint     `json:"task_id"`
	Emails          []string `json:"emails"`
	ChunkTimeoutSec int      `json:"chunk_timeout_sec,omitempty"`
}

type WebhookDeliverPayload struct {
	URL     string                 `json:"url"`
	Secret  string                 `json:"secret"`
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
}

func resultMap(email string, res engine.VerifyResult) map[string]interface{} {
	return map[string]interface{}{
		"email":           email,
		"status":          res.Status,
		"score":           res.Score,
		"is_deliverable":  res.Deliverable,
		"is_catch_all":    res.CatchAll,
		"is_disposable":   res.Status == "disposable",
		"is_free":         res.IsFree,
		"is_role":         res.IsRole,
		"is_blacklisted":  res.IsBlacklisted,
		"has_mx":          res.HasMX,
		"mx_records":      res.MxRecords,
		"reason":          res.Reason,
		"time_taken":      res.ProcessingTime,
		"smtp_connect":    res.SMTPConnect,
		"user_exists":     res.Deliverable,
		"is_syntax_valid": res.SyntaxValid,
		"is_spam_trap":    res.IsSpamTrap,
		"mailbox_full":    res.MailboxFull,
	}
}

// HandleEmailVerifyTask processes a single email verification task
func HandleEmailVerifyTask(ctx context.Context, t *asynq.Task) error {
	if !config.IsWorkerEnabled() {
		// Return error without SkipRetry so Asynq re-queues the task in Redis
		// for other active/enabled peer workers to pick up and verify.
		return fmt.Errorf("worker disabled by administrator; releasing task for other workers")
	}

	var p EmailTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	logger.Info("Processing Single Job", zap.String("job_id", p.JobID), zap.Uint("task_id", p.TaskID))

	res := engine.VerifyEmail(ctx, p.Email)
	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, []map[string]interface{}{resultMap(p.Email, res)})
}

// HandleEmailChunkTask processes an email chunk for bulk verification
func HandleEmailChunkTask(asynqCtx context.Context, t *asynq.Task) error {
	if !config.IsWorkerEnabled() {
		// Return error without SkipRetry so Asynq re-queues the task in Redis
		// for other active/enabled peer workers to pick up and verify.
		return fmt.Errorf("worker disabled by administrator; releasing task for other workers")
	}

	var p EmailChunkTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	// Soft-stop before taking a concurrency slot: chunks already in Asynq are ACK'd.
	// Resume rebuilds remaining emails from source − job_results (no double charge).
	if jobcontrol.IsPaused(p.JobID) {
		logger.Info("Skipping chunk for paused job",
			zap.String("job_id", p.JobID),
			zap.Uint("task_id", p.TaskID),
			zap.Int("emails_count", len(p.Emails)),
		)
		return nil
	}

	// Concurrency-gate wait must NOT consume the Job Control chunk budget.
	chunkVerifyGate.Acquire()
	defer chunkVerifyGate.Release()

	if jobcontrol.IsPaused(p.JobID) {
		logger.Info("Job paused while waiting for gate — releasing without SMTP",
			zap.String("job_id", p.JobID),
			zap.Uint("task_id", p.TaskID),
		)
		return nil
	}

	workTimeout := time.Duration(p.ChunkTimeoutSec) * time.Second
	if workTimeout < time.Minute {
		workTimeout = 15 * time.Minute
	}
	ctx, cancel := context.WithTimeout(asynqCtx, workTimeout)
	defer cancel()

	logger.Info("Processing Chunk Job",
		zap.String("job_id", p.JobID),
		zap.Uint("task_id", p.TaskID),
		zap.Int("emails_count", len(p.Emails)),
		zap.Duration("chunk_timeout", workTimeout),
	)

	results := make([]map[string]interface{}, len(p.Emails))
	var wg sync.WaitGroup
	var mu sync.Mutex
	pausedMidChunk := false

	// Bounded Semaphore to limit concurrent outgoing TCP connections per chunk.
	sem := make(chan struct{}, 100)

spawnLoop:
	for i, email := range p.Emails {
		if jobcontrol.IsPaused(p.JobID) {
			pausedMidChunk = true
			break spawnLoop
		}
		select {
		case <-ctx.Done():
			break spawnLoop
		case sem <- struct{}{}:
		}

		wg.Add(1)
		idx := i
		emailAddr := email
		safe.Go(func() {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				return
			default:
			}

			res := engine.VerifyEmail(ctx, emailAddr)

			mu.Lock()
			results[idx] = resultMap(emailAddr, res)
			mu.Unlock()
		})
	}

	wg.Wait()
	if asynqCtx.Err() != nil {
		return asynqCtx.Err()
	}

	if pausedMidChunk {
		// Only push emails actually verified — do NOT mark the rest unknown
		// (that would burn results / risky refunds). Resume re-queues gaps.
		partial := make([]map[string]interface{}, 0, len(results))
		for _, row := range results {
			if row != nil {
				partial = append(partial, row)
			}
		}
		logger.Info("Chunk soft-stopped on pause; pushing partial results",
			zap.String("job_id", p.JobID),
			zap.Uint("task_id", p.TaskID),
			zap.Int("verified", len(partial)),
			zap.Int("total", len(p.Emails)),
		)
		if len(partial) == 0 {
			return nil
		}
		return reporter.ReportBatchToAPI(p.JobID, p.TaskID, partial)
	}

	// Job Control budget exhausted: persist what we have and do not retry the chunk.
	gapReason := "cancelled"
	if ctx.Err() != nil {
		gapReason = "timeout"
	}
	for i, row := range results {
		if row == nil {
			results[i] = resultMap(p.Emails[i], engine.VerifyResult{
				Status: "unknown",
				Score:  35,
				Reason: gapReason,
			})
		}
	}

	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, results)
}

// HandleWebhookTask delivers webhooks
func HandleWebhookTask(ctx context.Context, t *asynq.Task) error {
	if !config.IsWorkerEnabled() {
		return fmt.Errorf("worker disabled by administrator; releasing task for other workers")
	}

	var p WebhookDeliverPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	logger.Info("Delivering Webhook", zap.String("event", p.Event), zap.String("url", p.URL))

	if err := assertSafeWebhookURL(p.URL); err != nil {
		return fmt.Errorf("unsafe webhook URL: %v: %w", err, asynq.SkipRetry)
	}

	jsonData, err := json.Marshal(map[string]interface{}{
		"event":     p.Event,
		"data":      p.Payload,
		"timestamp": time.Now().Unix(),
	})
	if err != nil {
		return fmt.Errorf("failed to marshal webhook data: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "EJP-Webhook-Worker/1.0")

	if p.Secret != "" {
		h := hmac.New(sha256.New, []byte(p.Secret))
		h.Write(jsonData)
		signature := hex.EncodeToString(h.Sum(nil))
		req.Header.Set("X-EJP-Signature", signature)
	}

	resp, err := webhookClient.Do(req)
	if err != nil {
		return fmt.Errorf("webhook delivery failed: %v", err)
	}
	defer resp.Body.Close()

	// Drain body to enable TCP connection reuse
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		logger.Info("Webhook delivered successfully", zap.String("url", p.URL), zap.Int("status", resp.StatusCode))
		return nil
	}

	// M3 Fix: 4xx means the recipient endpoint is rejecting our payload.
	// Retrying would be pointless and waste queue capacity.
	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		logger.Warn("Webhook rejected by recipient (4xx) — skipping retry",
			zap.String("url", p.URL), zap.Int("status", resp.StatusCode))
		return fmt.Errorf("webhook rejected with status %d (client error): %w", resp.StatusCode, asynq.SkipRetry)
	}

	return fmt.Errorf("webhook delivery returned server error %d", resp.StatusCode)
}

// HandleDeadLetterTask reports permanently failed tasks back to the backend API.
// This MUST run even when the worker is disabled — the backend must always receive
// a final result so jobs never stall waiting for emails that will never be verified.
func HandleDeadLetterTask(ctx context.Context, t *asynq.Task, err error) {
	disabledReason := !config.IsWorkerEnabled()
	logger.Warn("Handling Dead-Letter Task",
		zap.String("type", t.Type()),
		zap.Bool("worker_disabled", disabledReason),
		zap.Error(err),
	)
	switch t.Type() {
	case "email:verify":
		var p EmailTaskPayload
		if err := json.Unmarshal(t.Payload(), &p); err == nil {
			reason := fmt.Sprintf("worker_failed: %v", err)
			if disabledReason {
				reason = "worker_disabled"
			}
			failPayload := map[string]interface{}{
				"email":      p.Email,
				"status":     "unknown",
				"score":      0,
				"reason":     reason,
				"time_taken": 0.0,
			}
			_ = reporter.ReportBatchToAPIForce(p.JobID, p.TaskID, []map[string]interface{}{failPayload})
		}
	case "email:chunk:verify":
		var p EmailChunkTaskPayload
		if err := json.Unmarshal(t.Payload(), &p); err == nil {
			reason := fmt.Sprintf("worker_chunk_failed: %v", err)
			if disabledReason {
				reason = "worker_disabled"
			}
			results := make([]map[string]interface{}, len(p.Emails))
			for i, emailAddr := range p.Emails {
				results[i] = map[string]interface{}{
					"email":      emailAddr,
					"status":     "unknown",
					"score":      0,
					"reason":     reason,
					"time_taken": 0.0,
				}
			}
			_ = reporter.ReportBatchToAPIForce(p.JobID, p.TaskID, results)
		}
	}
}

// assertSafeWebhookURL blocks non-HTTPS and private/loopback delivery targets (SSRF).
func assertSafeWebhookURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fmt.Errorf("empty webhook URL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid webhook URL")
	}
	if !strings.EqualFold(u.Scheme, "https") {
		return fmt.Errorf("webhook URL must use https")
	}
	if u.Host == "" || u.User != nil {
		return fmt.Errorf("invalid webhook URL")
	}
	host := u.Hostname()
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "metadata.google.internal" {
		return fmt.Errorf("private or local webhook target")
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
			return fmt.Errorf("private or local webhook target")
		}
		return nil
	}
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("webhook host could not be resolved")
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
			return fmt.Errorf("private or local webhook target")
		}
	}
	return nil
}
