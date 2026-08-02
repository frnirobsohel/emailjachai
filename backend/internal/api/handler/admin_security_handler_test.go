package handler

import "testing"

func TestAllowedDailyFreeLimits(t *testing.T) {
	allowed := []string{"5", "10", "15", "20"}
	for _, v := range allowed {
		if _, ok := allowedDailyFreeLimits[v]; !ok {
			t.Fatalf("expected %q to be allowed", v)
		}
	}
	for _, v := range []string{"", "1", "7", "25", "100", "-1"} {
		if _, ok := allowedDailyFreeLimits[v]; ok {
			t.Fatalf("expected %q to be rejected", v)
		}
	}
}

func TestUnblockConfirmNormalization(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"UNBLOCK", true},
		{"unblock", true},
		{" Unblock ", true},
		{"DELETE", false},
		{"", false},
		{"UN BLOCK", false},
	}
	for _, tc := range cases {
		got := normalizeUnblockConfirm(tc.in)
		if got != tc.want {
			t.Fatalf("normalizeUnblockConfirm(%q)=%v want %v", tc.in, got, tc.want)
		}
	}
}
