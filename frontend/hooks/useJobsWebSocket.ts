import { useEffect } from 'react'
import { useJobsStore } from '@/stores/jobs-store'
import { useDashboardStore } from '@/stores/dashboard-store'
import { WsMessage } from '@/hooks/use-socket'

export function useJobsWebSocket() {
  const updateJob = useJobsStore(state => state.updateJob)
  const setStats = useDashboardStore(state => state.setStats)

  useEffect(() => {
    const handleJobUpdate = (event: CustomEvent<WsMessage>) => {
      updateJob(event.detail.data)
    }

    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      // Keeps global dashboard stats fresh even when viewing jobs
      setStats(event.detail.data)
    }

    window.addEventListener('ws:job_update', handleJobUpdate as EventListener)
    window.addEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:job_update', handleJobUpdate as EventListener)
      window.removeEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)
    }
  }, [updateJob, setStats])
}
