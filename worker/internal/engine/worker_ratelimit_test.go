package engine

import (
	"context"
	"testing"
	"time"

	"ejp-worker/pkg/config"
)

func TestWaitWorkerRateLimitUnlimited(t *testing.T) {
	config.SetEffectiveWorkerRateLimitRPM(0)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if err := WaitWorkerRateLimit(ctx); err != nil {
		t.Fatalf("unlimited should not wait/fail: %v", err)
	}
}

func TestWaitWorkerRateLimitRespectsCancel(t *testing.T) {
	config.SetEffectiveWorkerRateLimitRPM(1) // 1/min — will block after first token
	defer config.SetEffectiveWorkerRateLimitRPM(0)

	// Consume the burst token
	if err := WaitWorkerRateLimit(context.Background()); err != nil {
		t.Fatalf("first wait: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := WaitWorkerRateLimit(ctx); err == nil {
		t.Fatal("expected wait to fail on cancelled context")
	}
}
