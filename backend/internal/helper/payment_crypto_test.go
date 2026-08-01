package helper

import "testing"

func TestLooksEncryptedSecret(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"", false},
		{"sk_test_abc", false},
		{"pk_live_xyz", false},
		{"gcm:abc:00112233445566778899aabbccddeeff", true},
		{"Y2lwaGVydGV4dA==:00112233445566778899aabbccddeeff", true},
		{"notbase64:zzzz", false},
	}
	for _, tc := range cases {
		if got := LooksEncryptedSecret(tc.in); got != tc.want {
			t.Fatalf("LooksEncryptedSecret(%q)=%v want %v", tc.in, got, tc.want)
		}
	}
}

func TestResolveAPIBaseURL(t *testing.T) {
	if got := ResolveAPIBaseURL("https://api.example.com/"); got != "https://api.example.com" {
		t.Fatalf("setting override: %s", got)
	}
	if got := ResolveAPIBaseURL(""); got != "http://localhost:8000" {
		t.Fatalf("default: %s", got)
	}
	if got := ResolveAPIBaseURL("   "); got != "http://localhost:8000" {
		t.Fatalf("blank: %s", got)
	}
}
