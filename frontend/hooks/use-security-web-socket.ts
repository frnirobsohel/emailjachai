import { useEffect } from 'react'
import { useSecurityStore } from '@/stores/security-store'
import { WsMessage } from '@/hooks/use-socket'

export function useSecurityWebSocket() {
  useEffect(() => {
    const handleSecurityLog = (event: CustomEvent<WsMessage>) => {
      const data = event.detail.data;
      const store = useSecurityStore.getState();
      store.addLog(data)
      store.updateStats({
        total_verified: store.stats.total_verified + 1,
        fraud_prevented: data.status === 'blocked' ? store.stats.fraud_prevented + 1 : store.stats.fraud_prevented
      })
    }

    const handleBlocklistUpdate = (event: CustomEvent<WsMessage>) => {
      const store = useSecurityStore.getState();
      store.addBlocked(event.detail.data)
      store.updateStats({
        currently_blocked: store.stats.currently_blocked + 1
      })
    }

    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      const store = useSecurityStore.getState();
      store.updateStats(event.detail.data)
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
