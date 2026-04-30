package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/hibiken/asynq"
)

// WebhookDeliverPayload must match the one in backend/internal/tasks/payloads.go
type WebhookDeliverPayload struct {
	URL     string                 `json:"url"`
	Secret  string                 `json:"secret"`
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
}

func handleWebhookTask(ctx context.Context, t *asynq.Task) error {
	var p WebhookDeliverPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Delivering Webhook: %s to %s", p.Event, p.URL)

	// 1. Prepare JSON body
	jsonData, err := json.Marshal(map[string]interface{}{
		"event":     p.Event,
		"data":      p.Payload,
		"timestamp": time.Now().Unix(),
	})
	if err != nil {
		return fmt.Errorf("failed to marshal webhook data: %v", err)
	}

	// 2. Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", p.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "EJP-Webhook-Worker/1.0")

	// 3. Add Signature if secret is provided
	if p.Secret != "" {
		h := hmac.New(sha256.New, []byte(p.Secret))
		h.Write(jsonData)
		signature := hex.EncodeToString(h.Sum(nil))
		req.Header.Set("X-EJP-Signature", signature)
	}

	// 4. Send request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook delivery failed: %v", err)
	}
	defer resp.Body.Close()

	// 5. Handle response
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Webhook delivered successfully to %s (Status: %d)", p.URL, resp.StatusCode)
		return nil
	}

	// For other status codes, return error so Asynq retries
	return fmt.Errorf("webhook delivery returned status %d", resp.StatusCode)
}
