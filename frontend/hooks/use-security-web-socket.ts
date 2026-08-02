import { useEffect } from 'react'
import {
  useSecurityStore,
  type SecurityLog,
  type BlockedEntry,
  type SecurityStats,
} from '@/stores/security-store'
import { WsMessage } from '@/hooks/use-socket'

export function useSecurityWebSocket() {
  useEffect(() => {
    const handleSecurityLog = (event: CustomEvent<WsMessage>) => {
      // addLog already bumps total_verified / fraud_prevented — do not double-count here.
      useSecurityStore.getState().addLog(event.detail.data as SecurityLog)
    }

    const handleBlocklistUpdate = (event: CustomEvent<WsMessage>) => {
      // addBlocked already bumps currently_blocked — do not double-count here.
      useSecurityStore.getState().addBlocked(event.detail.data as BlockedEntry)
    }

    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      useSecurityStore.getState().updateStats(event.detail.data as Partial<SecurityStats>)
    }

    window.addEventListener('ws:security_log', handleSecurityLog as EventListener)
    window.addEventListener('ws:blocklist_update', handleBlocklistUpdate as EventListener)
    window.addEventListener('ws:security_stats_update', handleStatsUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:security_log', handleSecurityLog as EventListener)
      window.removeEventListener('ws:blocklist_update', handleBlocklistUpdate as EventListener)
      window.removeEventListener('ws:security_stats_update', handleStatsUpdate as EventListener)
    }
  }, [])
}
