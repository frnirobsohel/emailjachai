"use client"

import { useEffect } from "react"
import { ShieldAlert, RefreshCw } from "lucide-react"

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Admin Panel Error:", error)
    }, [error])

    return (
        <div className="flex min-h-[500px] w-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-rose-500/10 p-4 text-rose-500">
                <ShieldAlert className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                Admin Panel Error
            </h2>
            <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
                {error.message || "We encountered an issue while communicating with the administrative backend service."}
            </p>
            <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-500 focus:outline-none"
            >
                <RefreshCw className="h-4 w-4" />
                Retry Request
            </button>
        </div>
    )
}
