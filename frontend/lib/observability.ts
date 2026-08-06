/**
 * Optional error reporting. When NEXT_PUBLIC_SENTRY_DSN (browser) or SENTRY_DSN
 * (server) is set, events are POSTed to Sentry's store endpoint. Without a DSN
 * this is a no-op besides console logging.
 */
type ReportErrorInput = {
  message: string
  error?: unknown
  tags?: Record<string, string>
  level?: 'error' | 'warning' | 'info'
}

function getDsn(): string | null {
  const dsn =
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    ''
  const trimmed = dsn.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseDsn(dsn: string): { publicKey: string; host: string; projectId: string } | null {
  try {
    const url = new URL(dsn)
    const publicKey = url.username
    const projectId = url.pathname.replace(/^\//, '').split('/')[0]
    if (!publicKey || !projectId) return null
    return { publicKey, host: url.host, projectId }
  } catch {
    return null
  }
}

export async function reportError(input: ReportErrorInput): Promise<void> {
  const message =
    input.error instanceof Error
      ? `${input.message}: ${input.error.message}`
      : input.message

  console.error('[observability]', message, input.error ?? '')

  const dsn = getDsn()
  if (!dsn) return

  const parsed = parseDsn(dsn)
  if (!parsed) {
    console.error('[observability] invalid Sentry DSN')
    return
  }

  const eventId = crypto.randomUUID().replace(/-/g, '')
  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: input.level ?? 'error',
    message,
    tags: input.tags,
    exception:
      input.error instanceof Error
        ? {
            values: [
              {
                type: input.error.name || 'Error',
                value: input.error.message,
                stacktrace: input.error.stack
                  ? { frames: [{ filename: 'app', function: 'stack', lineno: 0, colno: 0 }] }
                  : undefined,
              },
            ],
          }
        : undefined,
  }

  const endpoint = `https://${parsed.host}/api/${parsed.projectId}/store/`
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[observability] failed to send event', err)
  }
}
