import { useEffect } from 'react'
import { useLogsStore } from '@/stores/logs-store'
import type { LogEntry } from '@/app/admin/logs/logs-client'
import type { WsMessage } from '@/hooks/use-socket'

function wsFieldString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

function wsFieldNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') return Number(value)
  return fallback
}

function wsFieldOptionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') return Number(value)
  return undefined
}

function formatLogTime(raw: string): string {
  if (!raw) return new Date().toISOString().replace('T', ' ').substring(0, 19)
  if (raw.includes('T')) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().replace('T', ' ').substring(0, 19)
    }
  }
  return raw.length >= 19 ? raw.substring(0, 19) : raw
}

export function useLogsWebSocket() {
  const addLiveLog = useLogsStore(state => state.addLiveLog)

  useEffect(() => {
    const handleLogUpdate = (event: CustomEvent<WsMessage>) => {
      const logData = event.detail.data as Record<string, unknown>

      const timeStr = formatLogTime(
        wsFieldString(logData.time) || wsFieldString(logData.created_at)
      )

      const formattedLog: LogEntry = {
          id: wsFieldNumber(logData.id, Date.now()),
          user_id: wsFieldOptionalNumber(logData.user_id),
          level: wsFieldString(logData.level, 'INFO'),
          source: wsFieldString(logData.source, 'System'),
          message: wsFieldString(logData.message),
          ip: wsFieldString(logData.ip) || null,
          created_at: timeStr,
          time: timeStr,
      }

      addLiveLog(formattedLog)
    }

    window.addEventListener('ws:system_log_update', handleLogUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:system_log_update', handleLogUpdate as EventListener)
    }
  }, [addLiveLog])
}
