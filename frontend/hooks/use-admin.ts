import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { useUserStore } from '@/stores/user-state';

export function useAdmin() {
    const { user } = useUserStore();
    const isAdmin = user?.role === 'admin';

    const performAdminAction = useCallback(async (endpoint: string, data?: Record<string, unknown>) => {
        if (!isAdmin) {
            throw new Error('Unauthorized: Admin access required');
        }
        return await apiClient.post(`/admin/${endpoint}`, data);
    }, [isAdmin]);

    return {
        isAdmin,
        performAdminAction
    };
}
