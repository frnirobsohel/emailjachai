package config

import "testing"

func TestWorkerEnabledFlag(t *testing.T) {
	prev := IsWorkerEnabled()
	t.Cleanup(func() { SetWorkerEnabled(prev) })

	SetWorkerEnabled(false)
	if IsWorkerEnabled() {
		t.Fatal("expected disabled")
	}
	SetWorkerEnabled(true)
	if !IsWorkerEnabled() {
		t.Fatal("expected enabled")
	}
}
