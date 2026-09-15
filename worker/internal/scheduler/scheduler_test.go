package scheduler

import (
	"context"
	"testing"
	"time"
)

func TestWaitDomainScheduleNoCooldown(t *testing.T) {
	ctx := context.Background()
	called := false
	err := WaitDomainSchedule(ctx, "example.com", false, func(c context.Context, d string, free bool) error {
		called = true
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !called {
		t.Fatalf("local limiter was not invoked")
	}
}

func TestWaitDomainScheduleRespectsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := WaitDomainSchedule(ctx, "example.com", false, func(c context.Context, d string, free bool) error {
		return c.Err()
	})
	if err == nil {
		t.Fatalf("expected error on cancelled context, got nil")
	}
}

func TestRecordOutcomeNoCrash(t *testing.T) {
	// Should not panic even when Redis is offline or not configured
	RecordOutcome("example.com", OutcomeSuccess)
	RecordOutcome("example.com", OutcomeTempFail)
	RecordOutcome("example.com", OutcomeBlocked)
	TriggerCooldown("example.com", 1*time.Second, "test")
}
