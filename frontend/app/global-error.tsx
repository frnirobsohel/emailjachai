'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/observability'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void reportError({
      message: 'Unhandled Next.js global error',
      error,
      tags: { digest: error.digest || 'none', surface: 'global-error' },
    })
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ marginBottom: 16, color: '#555' }}>
          An unexpected error occurred. Please try again.
        </p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  )
}
