package engine

import "ejp-worker/internal/engine/syntax"

// IsValidMailboxSyntax delegates to the modular syntax package.
// Keeps rules identical across bulk accept and worker SMTP.
func IsValidMailboxSyntax(email string) bool {
	return syntax.IsValid(email)
}
