"use client"

import { useEffect } from "react"
import { WeeklyActivityChart } from "@/features/dashboard/components/weekly-activity-chart"
import { LifetimeUsageChart } from "@/features/dashboard/components/lifetime-usage-chart"
import { RecentActivity } from "@/features/dashboard/components/recent-activity"
import { QuickActions } from "@/features/dashboard/components/quick-actions"
import { StatsCards } from "@/features/dashboard/components/stats-cards"
import { useDashboardStore, type DashboardStats, type RecentDashboardJob } from "@/stores/dashboard-store"

interface DashboardClientProps {
    initialStats: DashboardStats
    initialRecentJobs: RecentDashboardJob[]
}

export function DashboardClient({ initialStats, initialRecentJobs }: DashboardClientProps) {
    const store = useDashboardStore()

    // Initialize store with server-fetched data on mount/navigation
    useEffect(() => {
        // Only initialize stats if the store doesn't have stats yet, to prevent overwriting
        // real-time WebSocket updates with stale Next.js Router Cache data.
        if (!store.stats) {
            store.setStats(initialStats)
        }
        store.setRecentJobs(initialRecentJobs)
    }, [initialStats, initialRecentJobs, store.stats])

    // Use store stats if available, otherwise fallback to initialStats (to prevent flash before hydration)
    const currentStats = store.stats || initialStats

    // Only show loading if we don't have stats yet
    const isLoadingStats = !currentStats

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs text-slate-500 font-mono tracking-wider">LIVE</span>
                </div>
            </div>

            {currentStats && (
                <>
                    <StatsCards stats={currentStats} isLoading={isLoadingStats} />

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <LifetimeUsageChart data={currentStats.usage_breakdown!} isLoading={isLoadingStats} />
                        <WeeklyActivityChart data={currentStats.weekly_activity!} isLoading={isLoadingStats} />
                    </div>
                </>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RecentActivity />
                <QuickActions />
            </div>
        </div>
    )
}
