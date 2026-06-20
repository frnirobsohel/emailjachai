import { create } from 'zustand';
import type { LogEntry } from '@/app/admin/logs/logs-client';

export interface LogsStore {
    logs: LogEntry[];
    total: number;
    hasMore: boolean;
    setInitial: (logs: LogEntry[], total: number, hasMore: boolean) => void;
    appendLogs: (newLogs: LogEntry[], total: number, hasMore: boolean) => void;
    addLiveLog: (log: LogEntry) => void;
    clearLogs: () => void;
}

const logKey = (log: LogEntry) => {
    if (log.id !== undefined && log.id !== null) return `id:${log.id}`;
    return `${log.created_at || log.time || ''}:${log.level}:${log.source}:${log.message}`;
};

export const useLogsStore = create<LogsStore>((set) => ({
    logs: [],
    total: 0,
    hasMore: true,

    setInitial: (logs, total, hasMore) => set({ logs, total, hasMore }),

    appendLogs: (newLogs, total, hasMore) => set((state) => {
        const seen = new Set(state.logs.map(logKey));
        const uniqueLogs = newLogs.filter((log) => {
            const key = logKey(log);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return {
            logs: [...state.logs, ...uniqueLogs],
            total,
            hasMore,
        };
    }),

    addLiveLog: (log) => set((state) => {
        const key = logKey(log);
        if (state.logs.some((existing) => logKey(existing) === key)) {
            return {};
        }

        return {
            logs: [log, ...state.logs].slice(0, 500),
            total: state.total + 1,
        };
    }),

    clearLogs: () => set({ logs: [], total: 0, hasMore: false })
}));
