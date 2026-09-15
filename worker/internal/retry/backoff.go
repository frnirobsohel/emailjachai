package retry

import (
	"crypto/rand"
	"math/big"
	"time"

	"github.com/hibiken/asynq"
)

// BackoffConfig holds the parameters for exponential backoff with jitter.
type BackoffConfig struct {
	BaseDelay time.Duration
	MaxDelay  time.Duration
	Factor    float64
	Jitter    float64 // fraction of delay to randomize, e.g. 0.25 = ±25%
}

var (
	// DefaultChunkBackoff is tuned for email chunk verification tasks.
	DefaultChunkBackoff = BackoffConfig{
		BaseDelay: 5 * time.Second,
		MaxDelay:  300 * time.Second,
		Factor:    2.0,
		Jitter:    0.25,
	}

	// DefaultWebhookBackoff is tuned for webhook delivery tasks.
	DefaultWebhookBackoff = BackoffConfig{
		BaseDelay: 3 * time.Second,
		MaxDelay:  180 * time.Second,
		Factor:    2.0,
		Jitter:    0.20,
	}
)

// CalculateDelay computes exponential backoff with full jitter for a given retry attempt count.
func (c BackoffConfig) CalculateDelay(n int) time.Duration {
	if n <= 0 {
		n = 0
	}
	// delay = BaseDelay * (Factor ^ n)
	delay := float64(c.BaseDelay)
	for i := 0; i < n; i++ {
		delay *= c.Factor
		if delay > float64(c.MaxDelay) {
			delay = float64(c.MaxDelay)
			break
		}
	}
	if delay > float64(c.MaxDelay) {
		delay = float64(c.MaxDelay)
	}

	// Add jitter: ± (delay * Jitter)
	if c.Jitter > 0 {
		jitterRange := delay * c.Jitter
		// Get random float between 0 and 1
		nBig, err := rand.Int(rand.Reader, big.NewInt(10000))
		if err == nil {
			rnd := float64(nBig.Int64()) / 10000.0 // 0.0 to 1.0
			delta := (rnd*2 - 1) * jitterRange    // -jitterRange to +jitterRange
			delay += delta
		}
	}

	if delay < float64(c.BaseDelay/2) {
		delay = float64(c.BaseDelay / 2)
	}

	return time.Duration(delay)
}

// AsynqRetryDelayFunc returns a task-aware RetryDelayFunc for asynq.Server.
// It applies customized backoff depending on whether the task is a webhook or verification chunk.
func AsynqRetryDelayFunc() asynq.RetryDelayFunc {
	return func(n int, e error, t *asynq.Task) time.Duration {
		if t != nil && t.Type() == "webhook:deliver" {
			return DefaultWebhookBackoff.CalculateDelay(n)
		}
		return DefaultChunkBackoff.CalculateDelay(n)
	}
}
