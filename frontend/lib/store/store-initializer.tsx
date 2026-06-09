"use client"

import { useRef } from 'react'
import { useDashboardStore, DashboardStats } from '@/lib/store/dashboard-store'

export function StoreInitializer({ stats }: { stats: DashboardStats | null }) {
    const initialized = useRef(false)
    if (!initialized.current && stats) {
        useDashboardStore.setState({ 
            stats,
            lastFetchedStats: Date.now(),
            isLoadingStats: false
        })
        initialized.current = true
    }
    return null
}
