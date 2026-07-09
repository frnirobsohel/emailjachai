package safe

import (
	"fmt"
	"runtime/debug"

	"ejp-backend/pkg/logger"
)

// Go launches a goroutine safely with automatic panic recovery and logging.
// In Go production systems, unrecovered panics in background goroutines crash the entire process.
// Using safe.Go guarantees that even if a background task panics, the server remains alive.
func Go(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				logger.Error("PANIC RECOVERED in background goroutine",
					"panic", fmt.Sprintf("%v", r),
					"stack", stack,
				)
			}
		}()
		fn()
	}()
}
