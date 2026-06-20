"use client"

import { useEffect } from "react"
import { Coins } from "lucide-react"
import { useDashboardStore } from "@/stores/dashboard-store"

export function CreditBadge() {
    const { stats, fetchStats } = useDashboardStore()
    const credits = stats?.credits_remaining || null;

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (!stats) return null;

    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full shadow-sm hover:bg-amber-100 transition-colors">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-900">{credits}</span>
            <span className="text-[10px] font-medium text-amber-600 uppercase tracking-tighter">Credits</span>
        </div>
    )
}
