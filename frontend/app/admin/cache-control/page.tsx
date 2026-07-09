import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Cache Control",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { CacheControlClient } from "@/app/admin/cache-control/cache-control-client"

export default async function CacheControlPage() {
    let initialStats = null;
    
    try {
        const statsRes = await fetchServer('/admin/cache/stats');
        if (statsRes.status === 'success') {
            initialStats = statsRes.data;
        }
    } catch (e) {
        console.error("Failed to fetch cache control stats:", e);
    }

    return <CacheControlClient initialStats={initialStats} />
}
