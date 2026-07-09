import { useEffect } from 'react'
import { useLogsStore } from '@/stores/logs-store'
import type { LogEntry } from '@/app/admin/logs/logs-client'
import { WsMessage } from '@/hooks/use-socket'

export function useLogsWebSocket() {
  const addLiveLog = useLogsStore(state => state.addLiveLog)

  useEffect(() => {
    const handleLogUpdate = (event: CustomEvent<WsMessage>) => {
      const logData = event.detail.data;
      
      let timeStr = logData.created_at || logData.time || new Date().toISOString();
      if (timeStr.includes('T')) {
          const date = new Date(timeStr);
          timeStr = date.toISOString().replace('T', ' ').substring(0, 16);
      }

      const formattedLog: LogEntry = {
          id: logData.id || Date.now(),
          user_id: logData.user_id,
          level: logData.level || "INFO",
          source: logData.source || "System",
          message: logData.message || "",
          ip: logData.ip || "127.0.0.1",
          time: timeStr,
      };

      addLiveLog(formattedLog)
    }

    window.addEventListener('ws:system_log_update', handleLogUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:system_log_update', handleLogUpdate as EventListener)
    }
  }, [addLiveLog])
}
