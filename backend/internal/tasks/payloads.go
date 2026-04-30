package tasks

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)

const (
	TypeEmailVerify     = "email:verify"
	TypeWebhookDeliver  = "webhook:deliver"
)

// EmailVerifyPayload holds the data needed to verify a single email
type EmailVerifyPayload struct {
	JobID  string `json:"job_id"`
	TaskID uint   `json:"task_id"`
	Email  string `json:"email"`
}

// WebhookDeliverPayload holds the data needed to send a webhook
type WebhookDeliverPayload struct {
	URL     string                 `json:"url"`
	Secret  string                 `json:"secret"`
	Event   string                 `json:"event"` // e.g., "job.completed"
	Payload map[string]interface{} `json:"payload"`
}

// NewEmailVerifyTask creates an asynq.Task for verifying an email
func NewEmailVerifyTask(jobID string, taskID uint, email string) (*asynq.Task, error) {
	payload, err := json.Marshal(EmailVerifyPayload{JobID: jobID, TaskID: taskID, Email: email})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeEmailVerify, payload), nil
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



