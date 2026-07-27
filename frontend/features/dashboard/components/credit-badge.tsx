"use client"

import { Coins } from "lucide-react"
import Link from "next/link"
import { useDashboardStore } from "@/stores/dashboard-store"

export function CreditBadge() {
    const credits = useDashboardStore((s) => s.stats?.credits_remaining ?? null)
    const hasStats = useDashboardStore((s) => !!s.stats)

    if (!hasStats) return null

    return (
        <Link
            href="/dashboard/credits"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-700/20 bg-amber-50 px-3 py-1.5 transition-colors hover:bg-amber-100"
        >
            <Coins className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-bold text-amber-950">{credits}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700">
                Credits
            </span>
        </Link>
    )
}
