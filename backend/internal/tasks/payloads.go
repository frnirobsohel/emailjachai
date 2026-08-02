package tasks

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)

const (
	TypeEmailChunkVerify = "email:chunk:verify"
	TypeWebhookDeliver   = "webhook:deliver"
)

// EmailChunkTaskPayload holds the data needed to verify a chunk of emails
type EmailChunkTaskPayload struct {
	JobID  string   `json:"job_id"`
	TaskID uint     `json:"task_id"`
	Emails []string `json:"emails"`
}

// WebhookDeliverPayload holds the data needed to send a webhook
type WebhookDeliverPayload struct {
	URL     string                 `json:"url"`
	Secret  string                 `json:"secret"`
	Event   string                 `json:"event"` // e.g., "job.completed"
	Payload map[string]interface{} `json:"payload"`
}

// NewEmailChunkTask creates an asynq.Task for verifying a chunk of emails
func NewEmailChunkTask(jobID string, taskID uint, emails []string) (*asynq.Task, error) {
	payload, err := json.Marshal(EmailChunkTaskPayload{JobID: jobID, TaskID: taskID, Emails: emails})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeEmailChunkVerify, payload), nil
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
