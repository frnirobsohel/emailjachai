"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Trash2, Search, Terminal, Circle, Loader2, RefreshCcw, Filter, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiClient } from "@/lib/api-client"
import { toast } from "react-hot-toast"
import { useLogsStore } from "@/stores/logs-store"
import { useLogsWebSocket } from "@/hooks/use-logs-web-socket"

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

const PAGE_SIZE = 50

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

export function LogsClient({ initialLogs, initialTotal, initialHasMore }: { initialLogs: LogEntry[], initialTotal: number, initialHasMore: boolean }) {
    const store = useLogsStore()
    const { logs, total, hasMore } = store
    const [offset, setOffset] = useState(initialLogs.length)
    
    // Connect to WebSocket to receive real-time system_log_update events
    useLogsWebSocket()
    const [isLoading, setIsLoading] = useState(false)
    const [isInitial, setIsInitial] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [levelFilter, setLevelFilter] = useState<string | null>(null)
    const [confirmingClear, setConfirmingClear] = useState(false)
    const clearTimerRef = useRef<NodeJS.Timeout | null>(null)

    const sentinelRef = useRef<HTMLDivElement>(null)

    const loadPage = useCallback(async (currentOffset: number) => {
        if (isLoading) return
        setIsLoading(true)
        try {
            const result = await ApiClient.get<{ logs: LogEntry[], total: number, has_more: boolean }>(`/admin/logs/list?limit=${PAGE_SIZE}&offset=${currentOffset}`);

            if (result.status === 'success' && result.data) {
                const newLogs = result.data.logs || [];
                store.appendLogs(newLogs, result.data.total || 0, result.data.has_more);
                setOffset(currentOffset + newLogs.length);
            }
        } catch (error) {
            toast.error("Failed to load log entries");
            console.error("Failed to fetch logs:", error);
        } finally {
            setIsLoading(false);
            setIsInitial(false);
        }
    }, [isLoading])

    useEffect(() => {
        if (initialLogs && initialLogs.length > 0) {
            store.setInitial(initialLogs, initialTotal, initialHasMore);
            setOffset(initialLogs.length);
        } else if (store.logs.length === 0) {
            store.clearLogs();
            setOffset(0);
            setIsInitial(true);
            loadPage(0);
        }
    }, [initialLogs, initialTotal, initialHasMore]);

    // Soft-nav can replay stale RSC logs — force a fresh first page on mount
    useEffect(() => {
        store.clearLogs();
        setOffset(0);
        setIsInitial(true);
        loadPage(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!sentinelRef.current) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading && !isInitial) {
                    loadPage(offset)
                }
            },
            { root: null, threshold: 0.1 }
        )
        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [hasMore, isLoading, offset, isInitial, loadPage])

    const handleRefresh = () => {
        store.clearLogs()
        setOffset(0)
        setIsInitial(true)
        loadPage(0)
    }

    const handleClearLogsClick = () => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            clearTimerRef.current = setTimeout(() => {
                setConfirmingClear(false);
            }, 3000);
            return;
        }

        doClearLogs();
    }

    const doClearLogs = async () => {
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
        setConfirmingClear(false);

        try {
            const result = await ApiClient.delete('/admin/logs/clear');

            if (result.status === 'success') {
                store.clearLogs();
                setOffset(0);
                toast.success("Activity logs cleared successfully");
            } else {
                toast.error(result.message || "Failed to clear logs");
            }
        } catch (error: any) {
            toast.error(error.message || "An error occurred while clearing logs.");
            console.error("Failed to clear logs:", error);
        }
    }

    useEffect(() => {
        return () => {
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
        }
    }, []);

    const filtered = logs.filter(log => {
        const matchSearch =
            (log.message || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.source || "").toLowerCase().includes(searchTerm.toLowerCase())
        const matchLevel = !levelFilter || log.level === levelFilter
        return matchSearch && matchLevel
    })

    return (
        <div className="flex-1 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl flex items-center gap-2">
                        <Activity className="h-7 w-7 sm:h-8 sm:w-8 text-[#0f5c52]" />
                        System Logs
                    </h2>
                    <p className="text-sm text-[#5a736c]">Monitor core events, worker activity, and security audits across the platform.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant="outline" 
                        className="bg-white border-[#0b1f1c]/10 shadow-sm hover:bg-[#f0f4f2]/60 transition-all" 
                        onClick={handleRefresh} 
                        disabled={isLoading}
                    >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button 
                        className={`text-white shadow-md transition-all active:scale-95 ${confirmingClear ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'}`} 
                        onClick={handleClearLogsClick}
                    >
                        <Trash2 className="mr-2 h-4 w-4" /> {confirmingClear ? "Confirm Clear" : "Clear Logs"}
                    </Button>
                </div>
            </div>

            {/* Main Terminal Container */}
            <Card className="shadow-xl border-slate-800 overflow-hidden bg-[#0a0c10] ring-1 ring-slate-800">

                {/* Terminal Toolbar */}
                <div className="px-5 py-4 border-b border-slate-800 bg-[#11141a] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="h-3 w-3 rounded-full bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                            <div className="h-3 w-3 rounded-full bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
                            <div className="h-3 w-3 rounded-full bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        </div>
                        <div className="h-4 w-px bg-slate-800 mx-1 hidden md:block" />
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                            <Terminal className="h-4 w-4 text-[#1a8a78]" />
                            <span className="font-semibold text-slate-300">system.log</span>
                            <span className="opacity-40">&mdash;</span>
                            <span className="text-[#1a8a78]/80">{filtered.length} visible</span>
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
                            {(["INFO", "WARN", "ERROR"] as const).map(level => (
                                <button
                                    key={level}
                                    onClick={() => setLevelFilter(prev => prev === level ? null : level)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${levelFilter === level
                                        ? level === "INFO" ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                            : level === "WARN" ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                                                : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.15)]"
                                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                                        }`}
                                >
                                    {level}
                                </button>
                            ))}
                            <button
                                onClick={() => setLevelFilter(null)}
                                className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${!levelFilter ? 'bg-[#1a8a78]/20 text-[#1a8a78] ring-1 ring-[#1a8a78]/50' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                ALL
                            </button>
                        </div>
                    </div>
                </div>

                {/* Log Table Header */}
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

                {/* Scrollable Logs Area */}
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
                            {filtered.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-600 font-mono">
                                    <div className="p-4 rounded-full bg-slate-900/50 border border-slate-800 mb-2">
                                        <Filter className="h-6 w-6 opacity-20" />
                                    </div>
                                    <span className="text-sm">No log entries matching your criteria.</span>
                                    <Button variant="link" className="text-[#1a8a78] text-xs h-auto p-0" onClick={() => {setSearchTerm(""); setLevelFilter(null)}}>Reset Filters</Button>
                                </div>
                            ) : (
                                filtered.map((log, index) => (
                                    <div
                                        key={log.id || index}
                                        className={`grid items-center px-6 py-2.5 font-mono text-[11px] hover:bg-white/[0.02] transition-colors group relative ${
                                            log.level === "ERROR" ? "bg-rose-500/[0.02]" : ""
                                        }`}
                                        style={{ gridTemplateColumns: "180px 80px 140px 1fr 130px" }}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-[2px] transition-all opacity-0 group-hover:opacity-100 ${
                                            log.level === "ERROR" ? "bg-rose-500" : log.level === "WARN" ? "bg-amber-500" : "bg-[#1a8a78]"
                                        }`} />
                                        
                                        <span className="text-slate-500 group-hover:text-slate-400 transition-colors whitespace-nowrap">
                                            {log.created_at || log.time}
                                        </span>
                                        
                                        <div className={`flex items-center gap-2 font-bold ${levelStyles[log.level]}`}>
                                            <Circle className={`h-1.5 w-1.5 ${levelDot[log.level]} shadow-[0_0_5px_currentColor]`} />
                                            {log.level}
                                        </div>
                                        
                                        <span className={`font-semibold ${sourceColor(log.source)}`}>
                                            {log.source.toUpperCase()}
                                        </span>
                                        
                                        <span className="text-slate-300 leading-relaxed pr-8 line-clamp-2 group-hover:line-clamp-none transition-all">
                                            {log.message}
                                        </span>
                                        
                                        <span className="text-slate-600 text-right whitespace-nowrap font-medium tabular-nums">
                                            {log.ip || "127.0.0.1"}
                                        </span>
                                    </div>
                                ))
                            )}

                            {/* Infinite Scroll Sentinel */}
                            {hasMore && (
                                <div ref={sentinelRef} className="py-10 flex flex-col items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-[#0f5c52]" />
                                    <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Streaming more entries...</span>
                                </div>
                            )}
                            {!hasMore && filtered.length > 0 && (
                                <div className="py-8 text-center">
                                    <span className="text-[10px] font-mono text-slate-700 uppercase tracking-[0.3em]">End of Log Buffer</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Terminal Status Bar */}
                <div className="px-6 py-3 border-t border-slate-800 bg-[#11141a] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="font-mono text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Live Stream Active</span>
                        </div>
                        <div className="h-3 w-px bg-slate-800" />
                        <span className="font-mono text-[10px] text-slate-500">
                            {logs.length} / {total} TOTAL OBJECTS
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-4 font-mono text-[10px]">
                        <span className="text-slate-500">
                            POLLING RATE: <span className="text-slate-300">AUTO</span>
                        </span>
                        <span className="text-slate-500">
                            BUFFER STATUS: <span className={hasMore ? "text-amber-500" : "text-emerald-500"}>{hasMore ? "CACHED" : "NOMINAL"}</span>
                        </span>
                    </div>
                </div>
            </Card>

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
