import { create } from 'zustand';
import type { ApiUser } from '@/app/admin/users/users-client';

interface UsersStore {
    users: ApiUser[];
    hasInitialized: boolean;
    setUsers: (users: ApiUser[]) => void;
    updateUser: (userId: number, patch: Partial<ApiUser>) => void;
    removeUser: (userId: number) => void;
    reset: () => void;
}

export const useUsersStore = create<UsersStore>((set) => ({
    users: [],
    hasInitialized: false,

    setUsers: (users) => set({ users, hasInitialized: true }),

    updateUser: (userId, patch) =>
        set((state) => ({
            users: state.users.map((u) =>
                u.id === userId ? { ...u, ...patch } : u
            ),
        })),

    removeUser: (userId) =>
        set((state) => ({
            users: state.users.filter((u) => u.id !== userId),
        })),

    reset: () => set({ users: [], hasInitialized: false }),
}));
