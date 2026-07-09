package safe

import (
	"fmt"
	"runtime/debug"

	"ejp-worker/pkg/logger"

	"go.uber.org/zap"
)

// Go runs a function in a safe goroutine that recovers from any panics,
// logs the stack trace, and prevents the worker process from crashing.
func Go(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				stack := string(debug.Stack())
				logger.Error("PANIC RECOVERED in Worker Goroutine",
					zap.Any("panic", r),
					zap.String("stack_trace", stack),
				)
				fmt.Printf("CRITICAL: Panic recovered in worker goroutine: %v\n%s\n", r, stack)
			}
		}()
		fn()
	}()
}
