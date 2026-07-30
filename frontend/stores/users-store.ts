import { create } from 'zustand';
import type { ApiUser } from '@/app/admin/users/users-client';

export type UsersSummary = {
    total: number;
    inactive: number;
    suspended: number;
    paid: number;
};

interface UsersStore {
    users: ApiUser[];
    total: number;
    page: number;
    limit: number;
    summary: UsersSummary;
    hasInitialized: boolean;
    setList: (payload: {
        users: ApiUser[];
        total: number;
        page: number;
        limit: number;
        summary?: UsersSummary;
    }) => void;
    setUsers: (users: ApiUser[]) => void;
    updateUser: (userId: number, patch: Partial<ApiUser>) => void;
    removeUser: (userId: number) => void;
    reset: () => void;
}

const emptySummary: UsersSummary = { total: 0, inactive: 0, suspended: 0, paid: 0 };

export const useUsersStore = create<UsersStore>((set) => ({
    users: [],
    total: 0,
    page: 1,
    limit: 25,
    summary: emptySummary,
    hasInitialized: false,

    setList: ({ users, total, page, limit, summary }) =>
        set({
            users,
            total,
            page,
            limit,
            summary: summary ?? emptySummary,
            hasInitialized: true,
        }),

    setUsers: (users) => set({ users, hasInitialized: true, total: users.length }),

    updateUser: (userId, patch) =>
        set((state) => ({
            users: state.users.map((u) =>
                u.id === userId ? { ...u, ...patch } : u
            ),
        })),

    removeUser: (userId) =>
        set((state) => ({
            users: state.users.filter((u) => u.id !== userId),
            total: Math.max(0, state.total - 1),
        })),

    reset: () =>
        set({
            users: [],
            total: 0,
            page: 1,
            limit: 25,
            summary: emptySummary,
            hasInitialized: false,
        }),
}));
