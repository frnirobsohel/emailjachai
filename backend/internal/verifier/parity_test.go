package verifier

import "testing"

func TestKnownAcceptAllProvider(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"company-com.mail.protection.outlook.com", true},
		{"mail.protection.outlook.com", true},
		{"mx-vanilla.yahoodns.net", true},
		{"mx.yahoo.com", true},
		{"smtp.google.com", false},
		{"mail.customdomain.org", false},
	}
	for _, tc := range cases {
		if got := isKnownAcceptAllProvider(tc.host); got != tc.want {
			t.Errorf("isKnownAcceptAllProvider(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}

func TestSmtpHELOHostname(t *testing.T) {
	t.Setenv("SMTP_HELO_HOSTNAME", "mail.emailjachai.com")
	if got := smtpHELOHostname(); got != "mail.emailjachai.com" {
		t.Fatalf("smtpHELOHostname = %q, want mail.emailjachai.com", got)
	}

	t.Setenv("SMTP_HELO_HOSTNAME", "")
	got := smtpHELOHostname()
	if got == "" {
		t.Fatal("smtpHELOHostname should fallback to non-empty hostname")
	}
}
