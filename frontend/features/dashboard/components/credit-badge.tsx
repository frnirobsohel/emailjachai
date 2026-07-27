"use client"

import { useEffect } from "react"
import { Coins } from "lucide-react"
import Link from "next/link"
import { useDashboardStore } from "@/stores/dashboard-store"
import { useCreditStore } from "@/stores/credit-state"

export function CreditBadge() {
    const creditsRemaining = useDashboardStore((s) => s.stats?.credits_remaining ?? null)
    const fetchStats = useDashboardStore((s) => s.fetchStats)
    const isLoadingStats = useDashboardStore((s) => s.isLoadingStats)
    const balance = useCreditStore((s) => s.balance)
    const creditsReady = useCreditStore((s) => s.lastFetched != null)

    // After hard reload the Zustand store is empty — pull stats ASAP
    useEffect(() => {
        void fetchStats()
    }, [fetchStats])

    const display =
        creditsRemaining ??
        (creditsReady ? balance.toLocaleString() : null)

    if (display == null) {
        return (
            <div
                className="inline-flex h-9 min-w-[7.5rem] items-center gap-1.5 rounded-md border border-amber-700/15 bg-amber-50/70 px-3 py-1.5"
                aria-busy="true"
                aria-label="Loading credits"
            >
                <Coins className="h-4 w-4 animate-pulse text-amber-700/50" />
                <span className="h-3 w-10 animate-pulse rounded bg-amber-200/80" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700/50">
                    Credits
                </span>
            </div>
        )
    }

    return (
        <Link
            href="/dashboard/credits"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-700/20 bg-amber-50 px-3 py-1.5 transition-colors hover:bg-amber-100"
        >
            <Coins className={`h-4 w-4 text-amber-700 ${isLoadingStats ? "animate-pulse" : ""}`} />
            <span className="text-sm font-bold text-amber-950">{display}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-700">
                Credits
            </span>
        </Link>
    )
}
