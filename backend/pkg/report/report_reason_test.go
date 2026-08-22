package report

import "testing"

func TestGetFriendlyReasonSMTPSplit(t *testing.T) {
	cases := []struct {
		reason string
		want   string
	}{
		{"accepted", "Deliverable — mailbox accepted by SMTP"},
		{"smtp_unreachable", "No SMTP connection — check our outbound port 25, or recipient MX is down/blocking"},
		{"smtp_inconclusive", "SMTP connected but no clear mailbox answer — usually recipient greylist/policy"},
		{"temp_fail", "Recipient mail server greylisted or temporarily deferred the check"},
		{"private_mx", "MX resolves only to private/blocked IPs — cannot probe from the public internet"},
		{"catchall_inconclusive", "Catch-all probe inconclusive (recipient greylisted the random check)"},
		{"timeout", "Verification deadline exceeded before a clear SMTP answer"},
		{"catch_all", "Catch-all Domain (Accepts all incoming mail)"},
	}
	for _, tc := range cases {
		got := GetFriendlyReason(tc.reason, "unknown")
		if got != tc.want {
			t.Errorf("GetFriendlyReason(%q) = %q, want %q", tc.reason, got, tc.want)
		}
	}
}
