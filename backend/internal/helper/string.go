package helper

import (
	"fmt"
	"strings"
)

// FormatNumber adds commas to numbers for better readability (e.g., 1000 -> 1,000)
func FormatNumber(n int64) string {
	s := fmt.Sprintf("%d", n)
	isNegative := false
	if s[0] == '-' {
		isNegative = true
		s = s[1:]
	}

	if len(s) <= 3 {
		if isNegative {
			return "-" + s
		}
		return s
	}

	var res []byte
	for i, j := len(s)-1, 0; i >= 0; i, j = i-1, j+1 {
		if j > 0 && j%3 == 0 {
			res = append([]byte{','}, res...)
		}
		res = append([]byte{s[i]}, res...)
	}

	result := string(res)
	if isNegative {
		result = "-" + result
	}
	return result
}

// ToTitle converts a string to title case (e.g., "pending" -> "Pending", "completed" -> "Completed")
func ToTitle(s string) string {
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "_", " ")
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + strings.ToLower(w[1:])
		}
	}
	return strings.Join(words, " ")
}

// UcFirst capitalizes the first letter of a string
func UcFirst(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
// IsValidDomain checks if a string is a valid domain format
func IsValidDomain(domain string) bool {
	if len(domain) < 3 || len(domain) > 253 {
		return false
	}
	// Basic regex for domain validation
	// Matches: example.com, sub.example.co.uk, etc.
	// Rejects: .com, example, -example.com, etc.
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 63 {
			return false
		}
		if part[0] == '-' || part[len(part)-1] == '-' {
			return false
		}
		for _, char := range part {
			if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-') {
				return false
			}
		}
	}
	return true
}



