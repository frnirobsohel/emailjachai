import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Cache Control",
}

import { fetchServer } from "@/lib/fetch-server"
import { CacheControlClient, type CacheStatsInitial } from "@/app/admin/cache-control/cache-control-client"

export default async function CacheControlPage() {
    let initialStats: CacheStatsInitial | null = null;
    
    try {
        const statsRes = await fetchServer<CacheStatsInitial>('/admin/cache/stats');
        if (statsRes.status === 'success') {
            initialStats = statsRes.data ?? null;
        }
    } catch (e) {
        console.error("Failed to fetch cache control stats:", e);
    }

    return <CacheControlClient initialStats={initialStats} />
}
