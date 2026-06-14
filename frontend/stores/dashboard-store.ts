import { create } from 'zustand';
import { ApiClient } from '@/lib/api-client';

export interface DashboardStats {
    credits_remaining: string;
    lifetime_verifications: string;
    today_verifications: string;
    api_verifications?: string;
    total_jobs: number;
    active_jobs: number;
    weekly_activity?: Array<{ name: string; emails: number; jobs: number }>;
    usage_breakdown?: Array<{ name: string; value: number; color: string }>;
}

interface DashboardState {
    stats: DashboardStats | null;
    isLoadingStats: boolean;
    lastFetchedStats: number | null;
    fetchStats: (force?: boolean) => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
    stats: null,
    isLoadingStats: false,
    lastFetchedStats: null,
    fetchStats: async (force = false) => {
        const { stats, isLoadingStats, lastFetchedStats } = get();
        
        // Prevent duplicate fetches if already loading
        if (isLoadingStats) return;
        
        // Cache for 60 seconds unless forced
        const now = Date.now();
        if (!force && stats && lastFetchedStats && (now - lastFetchedStats < 60000)) {
            return;
        }

        set({ isLoadingStats: true });
        try {
            const result = await ApiClient.get<DashboardStats>('/dashboard/stats');
            if (result.status === 'success' && result.data) {
                set({ 
                    stats: result.data, 
                    lastFetchedStats: Date.now() 
                });
            }
        } catch (error) {
            console.error("Failed to fetch dashboard stats:", error);
        } finally {
            set({ isLoadingStats: false });
        }
    }
}));
