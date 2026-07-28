import { describe, it, expect, beforeEach } from 'vitest';
import { useUserStore } from './user-state';

describe('Zustand User Store', () => {
    beforeEach(() => {
        // Reset the store state before each test
        useUserStore.getState().clearUser();
        if (typeof window !== 'undefined') {
            localStorage.clear();
        }
    });

    it('should initialize with default states', () => {
        const state = useUserStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        // Ensure token does not exist in store anymore
        expect(Object.prototype.hasOwnProperty.call(state, 'token')).toBe(false);
    });

    it('should set user details but NOT save token to localStorage', () => {
        const mockUser = {
            id: '123',
            email: 'user@example.com',
            name: 'John Doe',
            role: 'user' as const
        };

        useUserStore.getState().setUser(mockUser);

        const state = useUserStore.getState();
        expect(state.user).toEqual(mockUser);
        expect(state.isAuthenticated).toBe(true);

        // Verify no auth_token exists in localStorage
        if (typeof window !== 'undefined') {
            expect(localStorage.getItem('auth_token')).toBeNull();
            expect(localStorage.getItem('sidebar_role')).toBeNull();
        }
    });

    it('should clear user state', () => {
        const mockUser = {
            id: '123',
            email: 'user@example.com',
            name: 'John Doe',
            role: 'user' as const
        };

        useUserStore.getState().setUser(mockUser);
        useUserStore.getState().clearUser();

        const state = useUserStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
    });
});
