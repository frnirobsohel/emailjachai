import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Dashboard",
}

import { fetchServer } from "@/lib/fetch-server"
import type { DashboardStats } from "@/stores/dashboard-store"
import { DashboardClient } from "./dashboard-client"

const EMPTY_STATS: DashboardStats = {
    credits_remaining: "0",
    today_verifications: "0",
    lifetime_verifications: "0",
    total_jobs: 0,
    active_jobs: 0,
    weekly_activity: [
        { name: 'Mon', emails: 0, jobs: 0 },
        { name: 'Tue', emails: 0, jobs: 0 },
        { name: 'Wed', emails: 0, jobs: 0 },
        { name: 'Thu', emails: 0, jobs: 0 },
        { name: 'Fri', emails: 0, jobs: 0 },
        { name: 'Sat', emails: 0, jobs: 0 },
        { name: 'Sun', emails: 0, jobs: 0 },
    ],
    usage_breakdown: [
        { name: 'Valid', value: 0, color: '#22c55e' },
        { name: 'Invalid', value: 0, color: '#ef4444' },
        { name: 'Unknown', value: 0, color: '#f59e0b' },
        { name: 'Catch-All', value: 0, color: '#cbd5e1' },
        { name: 'Disposable', value: 0, color: '#3b82f6' },
    ]
}

export default async function DashboardPage() {
    let stats = EMPTY_STATS;
    let initialRecentJobs: any[] = [];

    // Fetch stats + recent jobs in parallel on the server for fast initial load
    const [statsResult, jobsResult] = await Promise.all([
        fetchServer('/dashboard/stats'),
        fetchServer('/jobs/list?limit=4&type=all'),
    ]);

    if (statsResult.status === 'success' && statsResult.data) {
        stats = { ...EMPTY_STATS, ...statsResult.data };
    }

    if (jobsResult.status === 'success' && jobsResult.data) {
        initialRecentJobs = (jobsResult.data as any)?.jobs || [];
    }

    return <DashboardClient initialStats={stats} initialRecentJobs={initialRecentJobs} />;
}
