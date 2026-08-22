package helper

import "testing"

func TestIsValidMailboxSyntax(t *testing.T) {
	ok := []string{
		"user@example.com",
		"a.b+tag@gmail.com",
		"first_last@corp.co.uk",
	}
	for _, e := range ok {
		if !IsValidMailboxSyntax(e) {
			t.Fatalf("expected valid: %q", e)
		}
	}
	bad := []string{
		"",
		"not-an-email",
		"a@b",
		"a@b.c",
		"@domain.com",
		"user@",
		"@@@x.com",
		"user@domain",
		"user@@example.com",
		".user@example.com",
		"user.@example.com",
		"user@-example.com",
	}
	for _, e := range bad {
		if IsValidMailboxSyntax(e) {
			t.Fatalf("expected invalid: %q", e)
		}
	}
}
