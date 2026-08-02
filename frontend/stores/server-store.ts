import { create } from 'zustand';
import type { ServerNode } from '@/app/admin/server/server-client';

export interface WorkerHeartbeatPayload {
    server_name?: string;
    ip_address?: string;
    status?: string;
    enabled?: boolean;
    worker_count?: number;
    last_ping?: string;
}

export interface ServerStore {
    servers: ServerNode[];
    setServers: (servers: ServerNode[]) => void;
    applyWorkerHeartbeat: (payload: WorkerHeartbeatPayload) => void;
}

export const useServerStore = create<ServerStore>((set) => ({
    servers: [],
    setServers: (servers) => set({ servers }),
    applyWorkerHeartbeat: (payload) =>
        set((state) => {
            const name = (payload.server_name || '').trim();
            if (!name) {
                return state;
            }

            const enabled =
                typeof payload.enabled === 'boolean'
                    ? payload.enabled
                    : undefined;

            return {
                servers: state.servers.map((server) => {
                    if (server.name !== name) {
                        return server;
                    }

                    const nextEnabled =
                        enabled !== undefined ? enabled : server.config.enabled;
                    const nextStatus = !nextEnabled
                        ? 'disabled'
                        : payload.status === 'disabled'
                          ? 'disabled'
                          : 'active';

                    return {
                        ...server,
                        address: payload.ip_address || server.address,
                        status: nextStatus,
                        ping: nextStatus === 'active' ? 'live' : '--',
                        runningTime:
                            nextStatus === 'active' ? 'Just now' : server.runningTime,
                        workerCount:
                            typeof payload.worker_count === 'number'
                                ? payload.worker_count
                                : server.workerCount,
                        config: {
                            ...server.config,
                            enabled: nextEnabled,
                        },
                    };
                }),
            };
        }),
}));
