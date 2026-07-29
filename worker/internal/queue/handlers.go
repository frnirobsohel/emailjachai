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
	"net/http"
	"sync"
	"time"

	"ejp-worker/internal/engine"
	"ejp-worker/internal/reporter"
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
	JobID  string   `json:"job_id"`
	TaskID uint     `json:"task_id"`
	Emails []string `json:"emails"`
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

	res := engine.VerifyEmail(p.Email)
	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, []map[string]interface{}{resultMap(p.Email, res)})
}

// HandleEmailChunkTask processes an email chunk for bulk verification
func HandleEmailChunkTask(ctx context.Context, t *asynq.Task) error {
	var p EmailChunkTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	logger.Info("Processing Chunk Job",
		zap.String("job_id", p.JobID),
		zap.Uint("task_id", p.TaskID),
		zap.Int("emails_count", len(p.Emails)),
	)

	results := make([]map[string]interface{}, len(p.Emails))
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error

	// Bounded Semaphore to limit concurrent outgoing TCP connections per chunk.
	sem := make(chan struct{}, 100)

	for i, email := range p.Emails {
		select {
		case <-ctx.Done():
			wg.Wait()
			if firstErr == nil {
				firstErr = ctx.Err()
			}
			return firstErr
		default:
		}

		wg.Add(1)
		sem <- struct{}{}

		idx := i
		emailAddr := email
		safe.Go(func() {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				mu.Lock()
				if firstErr == nil {
					firstErr = ctx.Err()
				}
				mu.Unlock()
				return
			default:
			}

			res := engine.VerifyEmail(emailAddr)

			mu.Lock()
			results[idx] = resultMap(emailAddr, res)
			mu.Unlock()
		})
	}

	wg.Wait()
	if firstErr != nil {
		return firstErr
	}

	// Fill any gaps left by cancellation races with unknown placeholders
	for i, row := range results {
		if row == nil {
			results[i] = resultMap(p.Emails[i], engine.VerifyResult{
				Status: "unknown",
				Score:  35,
				Reason: "cancelled",
			})
		}
	}

	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, results)
}

// HandleWebhookTask delivers webhooks
func HandleWebhookTask(ctx context.Context, t *asynq.Task) error {
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

// HandleDeadLetterTask reports permanently failed tasks back to the backend API
func HandleDeadLetterTask(ctx context.Context, t *asynq.Task, err error) {
	logger.Warn("Handling Dead-Letter Task", zap.String("type", t.Type()), zap.Error(err))
	switch t.Type() {
	case "email:verify":
		var p EmailTaskPayload
		if err := json.Unmarshal(t.Payload(), &p); err == nil {
			failPayload := map[string]interface{}{
				"email":      p.Email,
				"status":     "unknown",
				"score":      0,
				"reason":     fmt.Sprintf("worker_failed: %v", err),
				"time_taken": 0.0,
			}
			_ = reporter.ReportBatchToAPI(p.JobID, p.TaskID, []map[string]interface{}{failPayload})
		}
	case "email:chunk:verify":
		var p EmailChunkTaskPayload
		if err := json.Unmarshal(t.Payload(), &p); err == nil {
			results := make([]map[string]interface{}, len(p.Emails))
			for i, emailAddr := range p.Emails {
				results[i] = map[string]interface{}{
					"email":      emailAddr,
					"status":     "unknown",
					"score":      0,
					"reason":     fmt.Sprintf("worker_chunk_failed: %v", err),
					"time_taken": 0.0,
				}
			}
			_ = reporter.ReportBatchToAPI(p.JobID, p.TaskID, results)
		}
	}
}
