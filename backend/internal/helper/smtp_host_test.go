package helper

import (
	"strings"
	"testing"
)

func TestValidatePublicSMTPHost_RejectsPrivate(t *testing.T) {
	cases := []string{"127.0.0.1", "localhost", "10.0.0.1", "192.168.1.1", "169.254.169.254"}
	for _, host := range cases {
		if err := ValidatePublicSMTPHost(host); err == nil {
			t.Fatalf("expected reject for %q", host)
		}
	}
}

func TestSanitizeEmailTemplateHTML(t *testing.T) {
	in := `Hello <script>alert(1)</script><b onclick="x">ok</b> javascript:alert(1)`
	out := SanitizeEmailTemplateHTML(in)
	if strings.Contains(out, "<script") || strings.Contains(out, "onclick") || strings.Contains(out, "javascript:") {
		t.Fatalf("unsafe content remained: %q", out)
	}
}
