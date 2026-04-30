"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/card"
import { Activity, List, ShieldCheck, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

type StatsData = {
    today_verifications: string
    lifetime_verifications: string
    total_jobs: number
    active_jobs: number
}

type StatsCardsProps = {
    stats: StatsData
    isLoading?: boolean
}

export function StatsCards({ stats, isLoading = false }: StatsCardsProps) {

    const cards = [
        {
            title: "Today's Activity",
            value: stats.today_verifications,
            label: "Verifications today",
            icon: Zap,
            color: "text-amber-600",
            bg: "bg-amber-100",
            trendUp: true
        },
        {
            title: "Total Verifications",
            value: stats.lifetime_verifications,
            label: "Lifetime verified",
            icon: ShieldCheck,
            color: "text-indigo-600",
            bg: "bg-indigo-100",
            trendUp: true
        },
        {
            title: "Total Jobs",
            value: stats.total_jobs.toString(),
            label: "Lifetime tasks",
            icon: List,
            color: "text-blue-600",
            bg: "bg-blue-100",
            trendUp: true
        },
        {
            title: "Active Jobs",
            value: stats.active_jobs.toString(),
            label: "Currently running",
            icon: Activity,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            trendUp: true
        },
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((stat, index) => (
                <Card key={index} className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">
                            {stat.title}
                        </CardTitle>
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", stat.bg)}>
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
                        ) : (
                            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                        )}
                        <div className="flex items-center text-xs text-muted-foreground mt-1">
                            {stat.label}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
