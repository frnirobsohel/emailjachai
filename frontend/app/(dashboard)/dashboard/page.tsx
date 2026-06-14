import { WeeklyActivityChart } from "@/features/dashboard/components/weekly-activity-chart"
import { LifetimeUsageChart } from "@/features/dashboard/components/lifetime-usage-chart"
import { RecentActivity } from "@/features/dashboard/components/recent-activity"
import { QuickActions } from "@/features/dashboard/components/quick-actions"
import { StatsCards } from "@/features/dashboard/components/stats-cards"
import { fetchServer } from "@/lib/fetch-server"
import type { DashboardStats } from "@/stores/dashboard-store"

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
    
    const result = await fetchServer('/dashboard/stats');
    if (result.status === 'success' && result.data) {
        stats = { ...EMPTY_STATS, ...result.data };
    }

    const currentStats = stats;
    const isLoadingStats = false; // Always false on server render

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>

            <StatsCards stats={currentStats} isLoading={isLoadingStats} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <LifetimeUsageChart data={currentStats.usage_breakdown || EMPTY_STATS.usage_breakdown!} isLoading={isLoadingStats} />
                <WeeklyActivityChart data={currentStats.weekly_activity || EMPTY_STATS.weekly_activity!} isLoading={isLoadingStats} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RecentActivity />
                <QuickActions />
            </div>
        </div>
    )
}
