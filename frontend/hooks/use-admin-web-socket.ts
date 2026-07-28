import { useEffect } from 'react'
import { useAdminStore, type AdminDashboardStats } from '@/stores/admin-store'
import { WsMessage } from '@/hooks/use-socket'

export function useAdminWebSocket() {
  const setData = useAdminStore(state => state.setData)

  useEffect(() => {
    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      setData(event.detail.data as AdminDashboardStats)
    }

    window.addEventListener('ws:admin_stats_update', handleStatsUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:admin_stats_update', handleStatsUpdate as EventListener)
    }
  }, [setData])
}
