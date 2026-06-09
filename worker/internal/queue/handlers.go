package queue

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"ejp-worker/internal/engine"
	"ejp-worker/internal/reporter"
	"ejp-worker/pkg/logger"

	"github.com/hibiken/asynq"
	"go.uber.org/zap"
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

// HandleEmailVerifyTask processes a single email verification task
func HandleEmailVerifyTask(ctx context.Context, t *asynq.Task) error {
	var p EmailTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	logger.Info("Processing Single Job", zap.String("job_id", p.JobID), zap.String("email", p.Email))

	res := engine.VerifyEmail(p.Email)

	resultPayload := map[string]interface{}{
		"email":          p.Email,
		"status":         res.Status,
		"score":          res.Score,
		"is_deliverable": res.Deliverable,
		"is_catch_all":   res.CatchAll,
		"is_disposable":  res.Status == "disposable",
		"is_free":        res.IsFree,
		"is_role":        res.IsRole,
		"is_blacklisted": res.IsBlacklisted,
		"reason":         res.Reason,
		"time_taken":     res.ProcessingTime,
	}

	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, []map[string]interface{}{resultPayload})
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

	for i, email := range p.Emails {
		wg.Add(1)
		go func(idx int, emailAddr string) {
			defer wg.Done()
			res := engine.VerifyEmail(emailAddr)
			
			mu.Lock()
			results[idx] = map[string]interface{}{
				"email":          emailAddr,
				"status":         res.Status,
				"score":          res.Score,
				"is_deliverable": res.Deliverable,
				"is_catch_all":   res.CatchAll,
				"is_disposable":  res.Status == "disposable",
				"is_free":        res.IsFree,
				"is_role":        res.IsRole,
				"is_blacklisted": res.IsBlacklisted,
				"reason":         res.Reason,
				"time_taken":     res.ProcessingTime,
			}
			mu.Unlock()
		}(i, email)
	}
	
	wg.Wait()
	
	return reporter.ReportBatchToAPI(p.JobID, p.TaskID, results)
}

// HandleWebhookTask delivers webhooks
func HandleWebhookTask(ctx context.Context, t *asynq.Task) error {
	var p WebhookDeliverPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
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

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook delivery failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		logger.Info("Webhook delivered successfully", zap.String("url", p.URL), zap.Int("status", resp.StatusCode))
		return nil
	}

	return fmt.Errorf("webhook delivery returned status %d", resp.StatusCode)
}
