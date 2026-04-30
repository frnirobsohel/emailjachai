package request

type DeleteJobRequest struct {
	JobID string `json:"job_id" binding:"required"`
}

type SingleVerifyRequest struct {
	Email          string `json:"email" binding:"required,email"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type SubmitBulkJobRequest struct {
	Name           string   `json:"name"`
	Emails         []string `json:"emails"`
	IdempotencyKey string   `json:"idempotencyKey"`
}
