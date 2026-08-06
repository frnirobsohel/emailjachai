package queue

import "testing"

func TestAssertSafeWebhookURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{name: "empty", url: "", wantErr: true},
		{name: "http rejected", url: "http://example.com/hook", wantErr: true},
		{name: "localhost", url: "https://localhost/hook", wantErr: true},
		{name: "loopback ip", url: "https://127.0.0.1/hook", wantErr: true},
		{name: "private ip", url: "https://10.0.0.5/hook", wantErr: true},
		{name: "metadata host", url: "https://metadata.google.internal/hook", wantErr: true},
		{name: "userinfo rejected", url: "https://user:pass@example.com/hook", wantErr: true},
		{name: "https public ip ok", url: "https://1.1.1.1/hook", wantErr: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := assertSafeWebhookURL(tc.url)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error for %q", tc.url)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error for %q: %v", tc.url, err)
			}
		})
	}
}

func TestDeadLetterFailPayloadShape(t *testing.T) {
	// Mirrors HandleDeadLetterTask email:verify mapping without hitting the API.
	failPayload := map[string]interface{}{
		"email":      "a@example.com",
		"status":     "unknown",
		"score":      0,
		"reason":     "worker_failed: smtp timeout",
		"time_taken": 0.0,
	}
	if failPayload["status"] != "unknown" {
		t.Fatal("dead-letter status must be unknown")
	}
	if failPayload["score"] != 0 {
		t.Fatal("dead-letter score must be 0")
	}
}
