import { create } from 'zustand';

// Typed to match the backend /admin/dashboard/stats response shape
export interface AdminStatCard {
    value: string;
    trend: string;
    status: 'up' | 'down';
}

export interface AdminDashboardStats {
    total_users?: AdminStatCard;
    active_jobs?: AdminStatCard;
    total_credits?: AdminStatCard;
    total_revenue?: AdminStatCard;
    emails_verified?: AdminStatCard;
    active_workers?: AdminStatCard;
    system_health?: AdminStatCard;
    recent_users?: Array<{ name: string; email: string; plan: string; date: string }>;
    recent_logs?: Array<{ id?: number; event: string; user: string; time: string; status: string }>;
}

export interface AdminStore {
    data: AdminDashboardStats | null;
    hasInitialized: boolean;
    setData: (data: AdminDashboardStats) => void;
    reset: () => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
    data: null,
    hasInitialized: false,
    setData: (data) => set({ data, hasInitialized: true }),
    reset: () => set({ data: null, hasInitialized: false }),
}));
