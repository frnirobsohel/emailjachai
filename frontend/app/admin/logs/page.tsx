import { Metadata } from "next"

export const metadata: Metadata = {
    title: "System Logs",
}

import { fetchServer } from "@/lib/fetch-server"
import { LogsClient, type LogEntry } from "./logs-client"

interface LogsListData {
    logs?: LogEntry[]
    total?: number
    has_more?: boolean
    next_before_id?: number
    next_before_created_at?: string
}

export default async function LogsPage() {
    let initialLogs: LogEntry[] = []
    let initialTotal = 0
    let initialHasMore = false
    let initialNextBeforeId: number | null = null
    let initialNextBeforeCreatedAt: string | null = null

    try {
        const result = await fetchServer<LogsListData>("/admin/logs/list?limit=50")
        if (result.status === "success" && result.data) {
            initialLogs = result.data.logs || []
            initialTotal = result.data.total || 0
            initialHasMore = result.data.has_more || false
            initialNextBeforeId = result.data.next_before_id || null
            initialNextBeforeCreatedAt = result.data.next_before_created_at || null
        }
    } catch (e) {
        console.error("Failed to fetch admin logs:", e)
    }

    return (
        <LogsClient
            initialLogs={initialLogs}
            initialTotal={initialTotal}
            initialHasMore={initialHasMore}
            initialNextBeforeId={initialNextBeforeId}
            initialNextBeforeCreatedAt={initialNextBeforeCreatedAt}
        />
    )
}
