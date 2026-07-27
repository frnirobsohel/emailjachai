"use client"

import { useEffect } from "react"
import { WeeklyActivityChart } from "@/features/dashboard/components/weekly-activity-chart"
import { LifetimeUsageChart } from "@/features/dashboard/components/lifetime-usage-chart"
import { RecentActivity } from "@/features/dashboard/components/recent-activity"
import { QuickActions } from "@/features/dashboard/components/quick-actions"
import { StatsCards } from "@/features/dashboard/components/stats-cards"
import { useDashboardStore, type DashboardStats, type RecentDashboardJob } from "@/stores/dashboard-store"
import { ApiClient } from "@/lib/api-client"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
import { useUserStore } from "@/stores/user-state"

interface DashboardClientProps {
    initialStats: DashboardStats
    initialRecentJobs: RecentDashboardJob[]
}

export function DashboardClient({ initialStats, initialRecentJobs }: DashboardClientProps) {
    const store = useDashboardStore()
    const user = useUserStore((s) => s.user)
    const firstName = user?.name?.split(" ")[0] || "there"

    const fetchDashboardData = async () => {
        try {
            const [statsRes, jobsRes] = await Promise.all([
                ApiClient.get<DashboardStats>("/dashboard/stats"),
                ApiClient.get<{ jobs: RecentDashboardJob[]; total: number }>("/jobs/list?limit=4&type=all"),
            ])
            if (statsRes.status === "success" && statsRes.data) {
                store.setStats(statsRes.data)
            }
            if (jobsRes.status === "success" && jobsRes.data) {
                store.setRecentJobs(jobsRes.data.jobs || [])
            }
        } catch (error) {
            console.error("Failed to fetch dashboard data client-side:", error)
        }
    }

    useEffect(() => {
        if (!store.stats) {
            store.setStats(initialStats)
            store.setRecentJobs(initialRecentJobs)
        }
        // Mount-only refresh — avoid refetch loops when SSR props get new references
        void fetchDashboardData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const currentStats = store.stats || initialStats
    const isLoadingStats = !currentStats

    return (
        <div className="flex-1 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">
                        Welcome back, {firstName}
                    </h2>
                    <p className="mt-1 text-sm text-[#5a736c]">
                        Here&apos;s your verification activity overview.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <CreditBadge />
                    <div className="flex items-center gap-2 rounded-md border border-[#0b1f1c]/10 bg-white/70 px-2.5 py-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-mono text-[10px] font-medium tracking-wider text-[#5a736c]">
                            LIVE
                        </span>
                    </div>
                </div>
            </div>

            {currentStats && (
                <>
                    <StatsCards stats={currentStats} isLoading={isLoadingStats} />

                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-7">
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
