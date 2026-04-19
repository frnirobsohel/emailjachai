"use client"

import { useState, useEffect } from "react"
import { Coins } from "lucide-react"
import { ApiClient } from "@/lib/api-client"

export function CreditBadge() {
    const [credits, setCredits] = useState<string | null>(null)

    const fetchCredits = async () => {
        try {
            const result = await ApiClient.get('/dashboard/stats');
            if (result.status === 'success') {
                const stats = result.data as any;
                setCredits(stats.credits_remaining);
            }
        } catch (error) {
            // Silently fail as ApiClient already logged the error/warning
        }
    }

    useEffect(() => {
        fetchCredits();
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchCredits();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    if (credits === null) return null;

    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full shadow-sm hover:bg-amber-100 transition-colors">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-900">{credits}</span>
            <span className="text-[10px] font-medium text-amber-600 uppercase tracking-tighter">Credits</span>
        </div>
    )
}
