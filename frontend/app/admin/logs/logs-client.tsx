"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Trash2, Search, Terminal, Circle, Loader2, RefreshCcw, Filter, Activity, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiClient } from "@/lib/api-client"
import { toast } from "react-hot-toast"
import { useLogsStore } from "@/stores/logs-store"
import { useLogsWebSocket } from "@/hooks/use-logs-web-socket"
import { useRealtimeStore } from "@/stores/realtime-store"

export type LogEntry = {
    id?: number
    user_id?: number | null
    level: "INFO" | "WARN" | "ERROR" | string
    source: string
    message: string
    ip?: string | null
    created_at?: string
    time?: string
}

interface LogsClientProps {
    initialLogs: LogEntry[]
    initialTotal: number
    initialHasMore: boolean
    initialNextBeforeId?: number | null
    initialNextBeforeCreatedAt?: string | null
}

interface LogsListResponse {
    logs: LogEntry[]
    total: number
    has_more: boolean
    next_before_id?: number
    next_before_created_at?: string
}

const PAGE_SIZE = 50
const CLEAR_CONFIRM_PHRASE = "CLEAR"

const levelStyles: Record<string, string> = {
    INFO: "text-emerald-400",
    WARN: "text-amber-400",
    ERROR: "text-rose-400",
}

const levelDot: Record<string, string> = {
    INFO: "fill-emerald-500  text-emerald-500",
    WARN: "fill-amber-500 text-amber-500",
    ERROR: "fill-rose-500   text-rose-500",
}

const sourceColor = (source: string) => {
    if (source.includes("Worker")) return "text-[#1a8a78]"
    if (source.includes("Gateway") || source.includes("API")) return "text-orange-400"
    if (source === "System") return "text-teal-400"
    return "text-sky-400"
}

function displayIp(ip?: string | null) {
    const value = (ip || "").trim()
    if (!value || value === "127.0.0.1" || value === "0.0.0.0") return "—"
    return value
}

function displayTime(log: LogEntry) {
    const raw = log.time || log.created_at || ""
    if (!raw) return "—"
    if (raw.includes("T")) {
        const date = new Date(raw)
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString().replace("T", " ").substring(0, 19)
        }
    }
    return raw.length >= 19 ? raw.substring(0, 19) : raw
}

export function LogsClient({
    initialLogs,
    initialTotal,
    initialHasMore,
    initialNextBeforeId = null,
    initialNextBeforeCreatedAt = null,
}: LogsClientProps) {
    const store = useLogsStore()
    const { logs, total, hasMore, nextBeforeId, nextBeforeCreatedAt } = store
    const isConnected = useRealtimeStore((s) => s.isConnected)

    useLogsWebSocket()

    const [isLoading, setIsLoading] = useState(false)
    const [isInitial, setIsInitial] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [levelFilter, setLevelFilter] = useState<string | null>(null)
    const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
    const [clearConfirmText, setClearConfirmText] = useState("")
    const [isClearing, setIsClearing] = useState(false)

    const sentinelRef = useRef<HTMLDivElement>(null)
    const hydratedRef = useRef(false)
    const skipFilterEffectRef = useRef(true)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
        return () => clearTimeout(timer)
    }, [searchTerm])

    const buildListUrl = useCallback((cursor?: { id: number; createdAt: string } | null) => {
        const params = new URLSearchParams()
        params.set("limit", String(PAGE_SIZE))
        if (levelFilter) params.set("level", levelFilter)
        if (debouncedSearch) params.set("q", debouncedSearch)
        if (cursor?.id && cursor.createdAt) {
            params.set("before_id", String(cursor.id))
            params.set("before_created_at", cursor.createdAt)
        }
        return `/admin/logs/list?${params.toString()}`
    }, [debouncedSearch, levelFilter])

    const loadPage = useCallback(async (mode: "reset" | "append") => {
        if (isLoading) return
        setIsLoading(true)
        try {
            const cursor =
                mode === "append" && nextBeforeId && nextBeforeCreatedAt
                    ? { id: nextBeforeId, createdAt: nextBeforeCreatedAt }
                    : null

            const result = await ApiClient.get<LogsListResponse>(buildListUrl(cursor))

            if (result.status === "success" && result.data) {
                const newLogs = result.data.logs || []
                const nextId = result.data.next_before_id || null
                const nextAt = result.data.next_before_created_at || null

                if (mode === "reset") {
                    store.setInitial(
                        newLogs,
                        result.data.total || 0,
                        Boolean(result.data.has_more),
                        nextId,
                        nextAt,
                    )
                } else {
                    store.appendLogs(
                        newLogs,
                        result.data.total || 0,
                        Boolean(result.data.has_more),
                        nextId,
                        nextAt,
                    )
                }
            }
        } catch (error) {
            toast.error("Failed to load log entries")
            console.error("Failed to fetch logs:", error)
        } finally {
            setIsLoading(false)
            setIsInitial(false)
        }
    }, [buildListUrl, isLoading, nextBeforeCreatedAt, nextBeforeId, store])

    useEffect(() => {
        if (hydratedRef.current) return
        hydratedRef.current = true

        store.setInitial(
            initialLogs || [],
            initialTotal,
            initialHasMore,
            initialNextBeforeId,
            initialNextBeforeCreatedAt,
        )

        if (!initialLogs || initialLogs.length === 0) {
            setIsInitial(true)
            void loadPage("reset")
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from SSR
    }, [])

    useEffect(() => {
        if (!hydratedRef.current) return
        if (skipFilterEffectRef.current) {
            skipFilterEffectRef.current = false
            return
        }
        setIsInitial(true)
        store.clearLogs()
        void loadPage("reset")
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter-driven reset
    }, [debouncedSearch, levelFilter])

    useEffect(() => {
        if (!sentinelRef.current) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading && !isInitial) {
                    void loadPage("append")
                }
            },
            { root: null, threshold: 0.1 }
        )
        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [hasMore, isLoading, isInitial, loadPage])

    const handleRefresh = () => {
        setIsInitial(true)
        store.clearLogs()
        void loadPage("reset")
    }

    const handleOpenClearDialog = () => {
        setClearConfirmText("")
        setIsClearDialogOpen(true)
    }

    const handleConfirmClear = async () => {
        if (clearConfirmText.trim().toUpperCase() !== CLEAR_CONFIRM_PHRASE) {
            toast.error(`Type ${CLEAR_CONFIRM_PHRASE} to confirm`)
            return
        }

        setIsClearing(true)
        try {
            const result = await ApiClient.delete<{
                deleted?: number
                auth_failures_preserved?: boolean
            }>("/admin/logs/clear")

            if (result.status === "success") {
                store.clearLogs()
                setIsClearDialogOpen(false)
                setClearConfirmText("")
                const deleted = result.data?.deleted ?? 0
                toast.success(
                    deleted > 0
                        ? `Cleared ${deleted} log(s). Auth login-failure records preserved.`
                        : "Operational logs cleared. Auth login-failure records preserved.",
                )
                setIsInitial(true)
                void loadPage("reset")
            } else {
                toast.error(result.message || "Failed to clear logs")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "An error occurred while clearing logs.")
            console.error("Failed to clear logs:", error)
        } finally {
            setIsClearing(false)
        }
    }

    const canConfirmClear = clearConfirmText.trim().toUpperCase() === CLEAR_CONFIRM_PHRASE

    return (
        <div className="flex-1 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl flex items-center gap-2">
                        <Activity className="h-7 w-7 sm:h-8 sm:w-8 text-[#0f5c52]" />
                        System Logs
                    </h2>
                    <p className="text-sm text-[#5a736c]">
                        Monitor platform events from Auth, Admin, Payment, and Worker services.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        className="bg-white border-[#0b1f1c]/10 shadow-sm hover:bg-[#f0f4f2]/60 transition-all"
                        onClick={handleRefresh}
                        disabled={isLoading}
                    >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button
                        className="text-white shadow-md transition-all active:scale-95 bg-rose-600 hover:bg-rose-700 shadow-rose-100"
                        onClick={handleOpenClearDialog}
                    >
                        <Trash2 className="mr-2 h-4 w-4" /> Clear Logs
                    </Button>
                </div>
            </div>

            <Card className="shadow-xl border-slate-800 overflow-hidden bg-[#0a0c10] ring-1 ring-slate-800">
                <div className="px-5 py-4 border-b border-slate-800 bg-[#11141a] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="h-3 w-3 rounded-full bg-rose-500/90" />
                            <div className="h-3 w-3 rounded-full bg-amber-400/90" />
                            <div className="h-3 w-3 rounded-full bg-emerald-500/90" />
                        </div>
                        <div className="h-4 w-px bg-slate-800 mx-1 hidden md:block" />
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                            <Terminal className="h-4 w-4 text-[#1a8a78]" />
                            <span className="font-semibold text-slate-300">system.log</span>
                            <span className="opacity-40">&mdash;</span>
                            <span className="text-[#1a8a78]/80">{logs.length} visible</span>
                            <span className="opacity-40">/</span>
                            <span>{total} entries</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 group-focus-within:text-[#1a8a78] transition-colors" />
                            <Input
                                id="log-search"
                                placeholder="Filter by message or source..."
                                className="pl-9 h-9 text-xs bg-[#0a0c10] border-slate-800 text-slate-300 placeholder:text-slate-600 focus-visible:ring-[#0f5c52]/30 font-mono w-60 shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="h-6 w-px bg-slate-800 mx-1" />

                        <div className="flex items-center gap-1.5 p-1 bg-black/20 rounded-lg border border-slate-800">
                            {(["INFO", "WARN", "ERROR"] as const).map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setLevelFilter((prev) => (prev === level ? null : level))}
                                    className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                                        levelFilter === level
                                            ? level === "INFO"
                                                ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50"
                                                : level === "WARN"
                                                    ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50"
                                                    : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/50"
                                            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                                    }`}
                                >
                                    {level}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setLevelFilter(null)}
                                className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                                    !levelFilter
                                        ? "bg-[#1a8a78]/20 text-[#1a8a78] ring-1 ring-[#1a8a78]/50"
                                        : "text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                ALL
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    className="grid font-mono text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] px-6 py-2.5 border-b border-slate-800/50 bg-[#0a0c10] select-none"
                    style={{ gridTemplateColumns: "180px 80px 140px 1fr 130px" }}
                >
                    <span>Timestamp</span>
                    <span>Level</span>
                    <span>Source</span>
                    <span>Message</span>
                    <span className="text-right">Origin IP</span>
                </div>

                <div
                    className="divide-y divide-slate-800/30 overflow-y-auto custom-scrollbar bg-[#0a0c10]"
                    style={{ height: "calc(100vh - 420px)", minHeight: "500px" }}
                >
                    {isInitial && isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-600 font-mono">
                            <Loader2 className="h-8 w-8 animate-spin text-[#0f5c52]" />
                            <span className="text-sm tracking-widest animate-pulse uppercase">Initializing Buffer...</span>
                        </div>
                    ) : (
                        <>
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-600 font-mono">
                                    <div className="p-4 rounded-full bg-slate-900/50 border border-slate-800 mb-2">
                                        <Filter className="h-6 w-6 opacity-20" />
                                    </div>
                                    <span className="text-sm">No log entries matching your criteria.</span>
                                    <Button
                                        variant="link"
                                        className="text-[#1a8a78] text-xs h-auto p-0"
                                        onClick={() => {
                                            setSearchTerm("")
                                            setLevelFilter(null)
                                        }}
                                    >
                                        Reset Filters
                                    </Button>
                                </div>
                            ) : (
                                logs.map((log, index) => (
                                    <div
                                        key={log.id ?? `row-${index}`}
                                        className={`grid items-center px-6 py-2.5 font-mono text-[11px] hover:bg-white/[0.02] transition-colors group relative ${
                                            log.level === "ERROR" ? "bg-rose-500/[0.02]" : ""
                                        }`}
                                        style={{ gridTemplateColumns: "180px 80px 140px 1fr 130px" }}
                                    >
                                        <div
                                            className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all opacity-0 group-hover:opacity-100 ${
                                                log.level === "ERROR"
                                                    ? "bg-rose-500"
                                                    : log.level === "WARN"
                                                        ? "bg-amber-500"
                                                        : "bg-[#1a8a78]"
                                            }`}
                                        />

                                        <span className="text-slate-500 group-hover:text-slate-400 transition-colors whitespace-nowrap">
                                            {displayTime(log)}
                                        </span>

                                        <div className={`flex items-center gap-2 font-bold ${levelStyles[log.level] || "text-slate-400"}`}>
                                            <Circle className={`h-1.5 w-1.5 ${levelDot[log.level] || "fill-slate-500 text-slate-500"}`} />
                                            {log.level}
                                        </div>

                                        <span className={`font-semibold ${sourceColor(log.source || "System")}`}>
                                            {(log.source || "System").toUpperCase()}
                                        </span>

                                        <span className="text-slate-300 leading-relaxed pr-8 line-clamp-2 group-hover:line-clamp-none transition-all">
                                            {log.message}
                                        </span>

                                        <span className="text-slate-600 text-right whitespace-nowrap font-medium tabular-nums">
                                            {displayIp(log.ip)}
                                        </span>
                                    </div>
                                ))
                            )}

                            {hasMore && (
                                <div ref={sentinelRef} className="py-10 flex flex-col items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-[#0f5c52]" />
                                    <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                                        Streaming more entries...
                                    </span>
                                </div>
                            )}
                            {!hasMore && logs.length > 0 && (
                                <div className="py-8 text-center">
                                    <span className="text-[10px] font-mono text-slate-700 uppercase tracking-[0.3em]">
                                        End of Log Buffer
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-3 border-t border-slate-800 bg-[#11141a] flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            {isConnected ? (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                    <span className="font-mono text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                        Live Stream Active
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                                    <span className="font-mono text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                                        Live Stream Offline
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="h-3 w-px bg-slate-800" />
                        <span className="font-mono text-[10px] text-slate-500">
                            {logs.length} / {total} TOTAL OBJECTS
                        </span>
                    </div>

                    <div className="flex items-center gap-4 font-mono text-[10px]">
                        <span className="text-slate-500">
                            MODE: <span className="text-slate-300">CURSOR</span>
                        </span>
                        <span className="text-slate-500">
                            BUFFER:{" "}
                            <span className={hasMore ? "text-amber-500" : "text-emerald-500"}>
                                {hasMore ? "MORE AVAILABLE" : "NOMINAL"}
                            </span>
                        </span>
                    </div>
                </div>
            </Card>

            {isClearDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-50 text-red-600">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Clear operational logs?</h3>
                                <p className="text-xs text-slate-500">DESTRUCTIVE</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600">
                            Permanently deletes operational activity logs. Auth login-failure records used for
                            brute-force protection are preserved.
                        </p>
                        <div>
                            <label htmlFor="clear-confirm-input" className="text-xs font-medium text-slate-600">
                                Type <span className="font-mono font-bold">{CLEAR_CONFIRM_PHRASE}</span> to confirm
                            </label>
                            <Input
                                id="clear-confirm-input"
                                className="mt-2 h-9 font-mono text-sm"
                                value={clearConfirmText}
                                onChange={(e) => setClearConfirmText(e.target.value)}
                                placeholder={CLEAR_CONFIRM_PHRASE}
                                autoComplete="off"
                                disabled={isClearing}
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button
                                variant="outline"
                                className="flex-1"
                                disabled={isClearing}
                                onClick={() => {
                                    setIsClearDialogOpen(false)
                                    setClearConfirmText("")
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                disabled={isClearing || !canConfirmClear}
                                onClick={() => void handleConfirmClear()}
                            >
                                {isClearing ? "Clearing..." : "Clear Logs"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #0a0c10;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155;
                }
            `}</style>
        </div>
    )
}
