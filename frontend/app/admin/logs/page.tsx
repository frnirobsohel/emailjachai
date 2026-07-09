import { Metadata } from "next"

export const metadata: Metadata = {
    title: "System Logs",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { LogsClient, LogEntry } from "./logs-client"

export default async function LogsPage() {
    let initialLogs: LogEntry[] = [];
    let initialTotal = 0;
    let initialHasMore = false;
    
    try {
        const result = await fetchServer('/admin/logs/list?limit=50&offset=0');
        if (result.status === 'success' && result.data) {
            initialLogs = result.data.logs as LogEntry[] || [];
            initialTotal = result.data.total || 0;
            initialHasMore = result.data.has_more || false;
        }
    } catch (e) {
        console.error("Failed to fetch admin logs:", e);
    }

    return <LogsClient initialLogs={initialLogs} initialTotal={initialTotal} initialHasMore={initialHasMore} />
}
