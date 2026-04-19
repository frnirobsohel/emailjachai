"use client"

import { useEffect, useState, useRef } from "react"
import { WeeklyActivityChart } from "@/components/dashboard/weekly-activity-chart"
import { LifetimeUsageChart } from "@/components/dashboard/lifetime-usage-chart"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { ApiClient } from "@/lib/api-client"

type DashboardStats = {
    today_verifications: string
    lifetime_verifications: string
    total_jobs: number
    active_jobs: number
    weekly_activity: Array<{ name: string; emails: number; jobs: number }>
    usage_breakdown: Array<{ name: string; value: number; color: string }>
}

const EMPTY_STATS: DashboardStats = {
    today_verifications: "0",
    lifetime_verifications: "0",
    total_jobs: 0,
    active_jobs: 0,
    weekly_activity: [],
    usage_breakdown: []
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
    const [isLoading, setIsLoading] = useState(true)
    const statsRef = useRef<string>(JSON.stringify(EMPTY_STATS))

    const fetchStats = async () => {
        try {
            const result = await ApiClient.get<DashboardStats>('/dashboard/stats', true)
            if (result.status === 'success' && result.data) {
                const newDataStr = JSON.stringify(result.data)
                if (newDataStr !== statsRef.current) {
                    statsRef.current = newDataStr
                    setStats(result.data)
                }
            }
        } catch (error) {
            console.error("Failed to fetch dashboard stats:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()
        
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchStats()
            }
        }

        document.addEventListener("visibilitychange", onVisibilityChange)
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange)
        }
    }, [])

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>

            <StatsCards stats={stats} isLoading={isLoading} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <LifetimeUsageChart data={stats.usage_breakdown} isLoading={isLoading} />
                <WeeklyActivityChart data={stats.weekly_activity} isLoading={isLoading} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RecentActivity />
                <QuickActions />
            </div>
        </div>
    )
}