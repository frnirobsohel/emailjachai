import { useEffect } from 'react'
import { useDashboardStore, type DashboardStats, type RecentDashboardJob } from '@/stores/dashboard-store'
import { WsMessage } from '@/hooks/use-socket'

function toRecentJob(data: Record<string, unknown>): RecentDashboardJob | null {
  const jobId = data.job_id
  if (typeof jobId !== 'string' || !jobId) return null

  const type =
    (typeof data.type === 'string' && data.type) ||
    (typeof data.job_type === 'string' && data.job_type) ||
    undefined

  return {
    job_id: jobId,
    status: typeof data.status === 'string' ? data.status : 'pending',
    total_emails: typeof data.total_emails === 'number' ? data.total_emails : 0,
    processed_count: typeof data.processed_count === 'number' ? data.processed_count : undefined,
    filename: typeof data.filename === 'string' ? data.filename : null,
    type,
    created_at:
      typeof data.created_at === 'string'
        ? data.created_at
        : data.created_at != null
          ? String(data.created_at)
          : undefined,
  }
}

export function useDashboardWebSocket() {
  const setStats = useDashboardStore(state => state.setStats)
  const upsertRecentJob = useDashboardStore(state => state.upsertRecentJob)

  useEffect(() => {
    const handleStatsUpdate = (event: CustomEvent<WsMessage>) => {
      setStats(event.detail.data as DashboardStats)
    }

    const handleJobUpdate = (event: CustomEvent<WsMessage>) => {
      const job = toRecentJob(event.detail.data as Record<string, unknown>)
      if (job) upsertRecentJob(job)
    }

    window.addEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)
    window.addEventListener('ws:job_update', handleJobUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:user_stats_update', handleStatsUpdate as EventListener)
      window.removeEventListener('ws:job_update', handleJobUpdate as EventListener)
    }
  }, [setStats, upsertRecentJob])
}
