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

export interface RecentDashboardJob {
    job_id: string;
    filename?: string | null;
    status: "pending" | "processing" | "completed" | "failed" | string;
    total_emails: number;
    processed_count?: number;
    created_at?: string;
    job_type?: string;
}

interface DashboardState {
    stats: DashboardStats | null;
    recentJobs: RecentDashboardJob[];
    isLoadingStats: boolean;
    lastFetchedStats: number | null;
    fetchStats: (force?: boolean) => Promise<void>;
    setStats: (stats: DashboardStats) => void;
    setRecentJobs: (jobs: RecentDashboardJob[]) => void;
    upsertRecentJob: (job: RecentDashboardJob) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
    stats: null,
    recentJobs: [],
    isLoadingStats: false,
    lastFetchedStats: null,
    fetchStats: async (force = false) => {
        const { stats, isLoadingStats, lastFetchedStats } = get();
        
        // Prevent duplicate fetches if already loading
        if (isLoadingStats) return;
        
        // If we already have stats, don't refetch because WebSockets keep them fresh!
        if (!force && stats) {
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
    },
    setStats: (stats: DashboardStats) => {
        set({ stats, lastFetchedStats: Date.now() });
    },
    setRecentJobs: (jobs) => {
        set({ recentJobs: jobs.slice(0, 4) });
    },
    upsertRecentJob: (job) => {
        if (!job?.job_id) return;

        set((state) => {
            const existing = state.recentJobs.filter((item) => item.job_id !== job.job_id);
            const previous = state.recentJobs.find((item) => item.job_id === job.job_id);
            return {
                recentJobs: [{ ...previous, ...job }, ...existing].slice(0, 4),
            };
        });
    },
}));
