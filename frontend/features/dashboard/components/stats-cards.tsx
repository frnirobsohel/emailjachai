import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
            color: "text-amber-700",
            bg: "bg-amber-100",
        },
        {
            title: "Total Verifications",
            value: stats.lifetime_verifications,
            label: "Lifetime verified",
            icon: ShieldCheck,
            color: "text-[#0f5c52]",
            bg: "bg-[#0f5c52]/12",
        },
        {
            title: "Total Jobs",
            value: stats.total_jobs.toString(),
            label: "Lifetime tasks",
            icon: List,
            color: "text-[#0b3d4a]",
            bg: "bg-[#0b3d4a]/10",
        },
        {
            title: "Active Jobs",
            value: stats.active_jobs.toString(),
            label: "Currently running",
            icon: Activity,
            color: "text-emerald-700",
            bg: "bg-emerald-100",
        },
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((stat) => (
                <Card
                    key={stat.title}
                    className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none"
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#5a736c]">
                            {stat.title}
                        </CardTitle>
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", stat.bg)}>
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-8 w-20 animate-pulse rounded bg-[#0b1f1c]/5" />
                        ) : (
                            <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">
                                {stat.value}
                            </div>
                        )}
                        <p className="mt-1 text-xs text-[#6b857c]">{stat.label}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
