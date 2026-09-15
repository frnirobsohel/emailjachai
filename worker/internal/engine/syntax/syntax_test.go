package syntax

import "testing"

func TestValidate(t *testing.T) {
	tests := []struct {
		email   string
		valid   bool
		reason  string
	}{
		{"user@example.com", true, "valid"},
		{"first.last+tag@sub.domain.co", true, "valid"},
		{"user%123@domain.org", true, "valid"},
		{"a@b", false, "address_too_short"},
		{"user@.com", false, "invalid_domain_boundary"},
		{"user@com.", false, "invalid_domain_boundary"},
		{"user@-example.com", false, "invalid_domain_boundary"},
		{"user..name@example.com", false, "consecutive_dots"},
		{".user@example.com", false, "leading_or_trailing_dot_in_local"},
		{"user.@example.com", false, "leading_or_trailing_dot_in_local"},
		{"user@example..com", false, "consecutive_dots"},
		{"user@example", false, "invalid_tld"},
		{"user@e", false, "invalid_tld"},
		{"user space@example.com", false, "illegal_local_character"},
	}

	for _, tt := range tests {
		res := Validate(tt.email)
		if res.IsValid != tt.valid {
			t.Errorf("Validate(%q) = %v (reason: %s), want %v", tt.email, res.IsValid, res.Reason, tt.valid)
		}
	}
}
