import { create } from 'zustand';
import type { ServerNode } from '@/app/admin/server/server-client';

export interface ServerStore {
    servers: ServerNode[];
    setServers: (servers: ServerNode[]) => void;
}

export const useServerStore = create<ServerStore>((set) => ({
    servers: [],
    setServers: (servers) => set({ servers })
}));
