import { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Credit History",
}

import { fetchServer } from "@/lib/fetch-server"
import { CreditsHistoryClient } from "./history-client"
import type { Transaction } from "./history-client"

export default async function CreditsHistoryPage() {
    let initialStats = {
        credits_remaining: "0",
        total_purchased: "0",
        total_refunds: "0"
    };
    let initialTransactions: Transaction[] = [];
    let initialTotal = 0;
    
    try {
        const [statsResult, historyResult] = await Promise.all([
            fetchServer('/dashboard/stats'),
            fetchServer('/dashboard/history?limit=10&offset=0')
        ]);

        if (statsResult.status === 'success' && statsResult.data) {
            initialStats = statsResult.data as { credits_remaining: string, total_purchased: string, total_refunds: string };
        }

        if (historyResult.status === 'success' && historyResult.data) {
            initialTransactions = (historyResult.data as any).transactions || [];
            initialTotal = (historyResult.data as any).total || 0;
        }
    } catch (e) {
        console.error("Failed to fetch credits history data:", e);
    }

    return <CreditsHistoryClient 
        initialStats={initialStats} 
        initialTransactions={initialTransactions} 
        initialTotal={initialTotal} 
    />
}
