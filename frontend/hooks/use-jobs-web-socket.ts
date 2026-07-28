import { useEffect } from 'react'
import { useJobsStore } from '@/stores/jobs-store'
import { useDashboardStore, type DashboardStats } from '@/stores/dashboard-store'
import type { Job } from '@/features/jobs/components/jobs-client'
import { WsMessage } from '@/hooks/use-socket'

export function useJobsWebSocket() {
  const updateJob = useJobsStore(state => state.updateJob)
  const setStats = useDashboardStore(state => state.setStats)

  useEffect(() => {
    const handleJobUpdate = (event: CustomEvent<WsMessage>) => {
      updateJob(event.detail.data as Partial<Job> & { job_id: string })
    }

    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      // Keeps global dashboard stats fresh even when viewing jobs
      setStats(event.detail.data as DashboardStats)
    }

    window.addEventListener('ws:job_update', handleJobUpdate as EventListener)
    window.addEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:job_update', handleJobUpdate as EventListener)
      window.removeEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)
    }
  }, [updateJob, setStats])
}
