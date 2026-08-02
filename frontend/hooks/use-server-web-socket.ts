import { useEffect } from 'react'
import { useServerStore, type WorkerHeartbeatPayload } from '@/stores/server-store'
import type { ServerNode } from '@/app/admin/server/server-client'
import { WsMessage } from '@/hooks/use-socket'

export function useServerWebSocket() {
  const setServers = useServerStore(state => state.setServers)
  const applyWorkerHeartbeat = useServerStore(state => state.applyWorkerHeartbeat)

  useEffect(() => {
    const handleServerUpdate = (event: CustomEvent<WsMessage>) => {
      setServers(event.detail.data as ServerNode[])
    }

    const handleWorkerUpdate = (event: CustomEvent<WsMessage>) => {
      const payload = (event.detail?.data || {}) as WorkerHeartbeatPayload
      applyWorkerHeartbeat(payload)
    }

    window.addEventListener('ws:server_list_update', handleServerUpdate as EventListener)
    window.addEventListener('ws:worker_update', handleWorkerUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:server_list_update', handleServerUpdate as EventListener)
      window.removeEventListener('ws:worker_update', handleWorkerUpdate as EventListener)
    }
  }, [setServers, applyWorkerHeartbeat])
}
