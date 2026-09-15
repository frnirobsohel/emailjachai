package retry

import (
	"testing"
	"time"

	"github.com/hibiken/asynq"
)

func TestCalculateDelay(t *testing.T) {
	cfg := BackoffConfig{
		BaseDelay: 2 * time.Second,
		MaxDelay:  30 * time.Second,
		Factor:    2.0,
		Jitter:    0.1, // ±10%
	}

	d0 := cfg.CalculateDelay(0)
	if d0 < 1500*time.Millisecond || d0 > 2500*time.Millisecond {
		t.Errorf("Attempt 0 delay unexpected: %v", d0)
	}

	d1 := cfg.CalculateDelay(1)
	if d1 < 3000*time.Millisecond || d1 > 5000*time.Millisecond {
		t.Errorf("Attempt 1 delay unexpected: %v", d1)
	}

	dMax := cfg.CalculateDelay(10)
	if dMax > 35*time.Second {
		t.Errorf("Attempt 10 delay exceeded max: %v", dMax)
	}
}

func TestAsynqRetryDelayFunc(t *testing.T) {
	fn := AsynqRetryDelayFunc()
	taskChunk := asynq.NewTask("email:chunk:verify", nil)
	dChunk := fn(0, nil, taskChunk)
	if dChunk < 2*time.Second {
		t.Errorf("Chunk delay too short: %v", dChunk)
	}

	taskWebhook := asynq.NewTask("webhook:deliver", nil)
	dWebhook := fn(0, nil, taskWebhook)
	if dWebhook < 1*time.Second {
		t.Errorf("Webhook delay too short: %v", dWebhook)
	}
}
