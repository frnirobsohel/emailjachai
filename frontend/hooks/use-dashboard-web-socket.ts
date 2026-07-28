import { useEffect } from 'react'
import { useDashboardStore, type DashboardStats } from '@/stores/dashboard-store'
import { WsMessage } from '@/hooks/use-socket'

export function useDashboardWebSocket() {
  const setStats = useDashboardStore(state => state.setStats)

  useEffect(() => {
    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      setStats(event.detail.data as DashboardStats)
    }

    window.addEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)
    }
  }, [setStats])
}
