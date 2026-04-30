import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'reseller' | 'user';
    avatar?: string;
}

interface UserState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    setUser: (user: User, token: string) => void;
    clearUser: () => void;
    updateUser: (user: Partial<User>) => void;
}

export const useUserStore = create<UserState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            setUser: (user, token) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('auth_token', token);
                }
                set({ user, token, isAuthenticated: true });
            },
            clearUser: () => {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('auth_token');
                }
                set({ user: null, token: null, isAuthenticated: false });
            },
            updateUser: (userData) => set((state) => ({
                user: state.user ? { ...state.user, ...userData } : null
            })),
        }),
        {
            name: 'user-storage',
        }
    )
);
