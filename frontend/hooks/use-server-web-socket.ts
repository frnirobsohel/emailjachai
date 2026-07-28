import { useEffect } from 'react'
import { useServerStore } from '@/stores/server-store'
import type { ServerNode } from '@/app/admin/server/server-client'
import { WsMessage } from '@/hooks/use-socket'

export function useServerWebSocket() {
  const setServers = useServerStore(state => state.setServers)

  useEffect(() => {
    const handleServerUpdate = (event: CustomEvent<WsMessage>) => {
      setServers(event.detail.data as ServerNode[])
    }

    window.addEventListener('ws:server_list_update', handleServerUpdate as EventListener)

    return () => {
      window.removeEventListener('ws:server_list_update', handleServerUpdate as EventListener)
    }
  }, [setServers])
}
