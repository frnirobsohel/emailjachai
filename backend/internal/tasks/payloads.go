package tasks

import (
	"encoding/json"
	"time"

	"github.com/hibiken/asynq"
)

const (
	TypeEmailChunkVerify = "email:chunk:verify"
	TypeWebhookDeliver   = "webhook:deliver"
	TypeBulkPrepare      = "job:bulk:prepare"
)

// EmailChunkTaskPayload holds the data needed to verify a chunk of emails
type EmailChunkTaskPayload struct {
	JobID           string   `json:"job_id"`
	TaskID          uint     `json:"task_id"`
	Emails          []string `json:"emails"`
	ChunkTimeoutSec int      `json:"chunk_timeout_sec,omitempty"`
}

// BulkPreparePayload schedules post-accept prepare (shuffle/chunk/enqueue) for one job.
type BulkPreparePayload struct {
	JobID string `json:"job_id"`
}

// WebhookDeliverPayload holds the data needed to send a webhook
type WebhookDeliverPayload struct {
	URL     string                 `json:"url"`
	Secret  string                 `json:"secret"`
	Event   string                 `json:"event"` // e.g., "job.completed"
	Payload map[string]interface{} `json:"payload"`
}

// NewEmailChunkTask creates an asynq.Task for verifying a chunk of emails.
// chunkTimeout is the Job Control processing budget; it must start only after
// the worker acquires its concurrency slot (see worker HandleEmailChunkTask).
func NewEmailChunkTask(jobID string, taskID uint, emails []string, chunkTimeout time.Duration) (*asynq.Task, error) {
	sec := int(chunkTimeout / time.Second)
	if sec < 60 {
		sec = 60
	}
	payload, err := json.Marshal(EmailChunkTaskPayload{
		JobID:           jobID,
		TaskID:          taskID,
		Emails:          emails,
		ChunkTimeoutSec: sec,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeEmailChunkVerify, payload), nil
}

// NewBulkPrepareTask creates an asynq.Task to prepare an accepted bulk job for verification.
func NewBulkPrepareTask(jobID string) (*asynq.Task, error) {
	payload, err := json.Marshal(BulkPreparePayload{JobID: jobID})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeBulkPrepare, payload), nil
}

// NewWebhookDeliverTask creates an asynq.Task for delivering a webhook
func NewWebhookDeliverTask(url, secret, event string, data map[string]interface{}) (*asynq.Task, error) {
	payload, err := json.Marshal(WebhookDeliverPayload{
		URL:     url,
		Secret:  secret,
		Event:   event,
		Payload: data,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeWebhookDeliver, payload), nil
}
