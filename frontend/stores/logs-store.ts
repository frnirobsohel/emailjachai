import { create } from 'zustand';
import type { LogEntry } from '@/app/admin/logs/logs-client';

const MAX_BUFFER = 500;

export interface LogsStore {
    logs: LogEntry[];
    total: number;
    hasMore: boolean;
    nextBeforeId: number | null;
    nextBeforeCreatedAt: string | null;
    setInitial: (
        logs: LogEntry[],
        total: number,
        hasMore: boolean,
        nextBeforeId?: number | null,
        nextBeforeCreatedAt?: string | null,
    ) => void;
    appendLogs: (
        newLogs: LogEntry[],
        total: number,
        hasMore: boolean,
        nextBeforeId?: number | null,
        nextBeforeCreatedAt?: string | null,
    ) => void;
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
    nextBeforeId: null,
    nextBeforeCreatedAt: null,

    setInitial: (logs, total, hasMore, nextBeforeId = null, nextBeforeCreatedAt = null) =>
        set({
            logs: logs.slice(0, MAX_BUFFER),
            total,
            hasMore,
            nextBeforeId: nextBeforeId ?? null,
            nextBeforeCreatedAt: nextBeforeCreatedAt ?? null,
        }),

    appendLogs: (newLogs, total, hasMore, nextBeforeId = null, nextBeforeCreatedAt = null) =>
        set((state) => {
            const seen = new Set(state.logs.map(logKey));
            const uniqueLogs = newLogs.filter((log) => {
                const key = logKey(log);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            return {
                logs: [...state.logs, ...uniqueLogs].slice(0, MAX_BUFFER),
                total,
                hasMore: state.logs.length + uniqueLogs.length >= MAX_BUFFER ? false : hasMore,
                nextBeforeId: nextBeforeId ?? null,
                nextBeforeCreatedAt: nextBeforeCreatedAt ?? null,
            };
        }),

    addLiveLog: (log) =>
        set((state) => {
            const key = logKey(log);
            if (state.logs.some((existing) => logKey(existing) === key)) {
                return {};
            }

            return {
                logs: [log, ...state.logs].slice(0, MAX_BUFFER),
                total: state.total + 1,
            };
        }),

    clearLogs: () =>
        set({
            logs: [],
            total: 0,
            hasMore: false,
            nextBeforeId: null,
            nextBeforeCreatedAt: null,
        }),
}));
