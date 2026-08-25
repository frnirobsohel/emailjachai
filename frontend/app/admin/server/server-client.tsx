"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Server, RefreshCcw, Activity, Plus, Copy, Check, Trash2, Settings2,
    ShieldCheck, Zap, Clock, Database, Globe, Signal, Search, Eye, EyeOff, Lock, AlertCircle, Loader2, Flame, TrendingUp, AlertTriangle, Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { ApiClient } from "@/lib/api-client"
import { useServerStore } from "@/stores/server-store"
import { useServerWebSocket } from "@/hooks/use-server-web-socket"

export interface ServerNode {
    id: number
    name: string
    address: string
    port: string
    status: string
    ping: string
    runningTime: string
    emailsVerified: number
    emailsVerifiedToday?: number
    currentJob: string
    ipReputation: 'Good' | 'Medium' | 'Low' | 'Blacklist' | 'Band' | 'None'
    workerCount: number
    warmup_enabled?: boolean
    warmup_mode?: WarmupMode
    warmup_stage?: string
    config: {
        rateLimit: number
        chunkSize: number
        enabled: boolean
    }
}

const addServerSchema = z.object({
    name: z
        .string()
        .trim()
        .min(3, "Name must be at least 3 characters")
        .max(100, "Name is too long")
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dots, underscores, or hyphens"),
    ip: z
        .string()
        .trim()
        .min(3, "IP/Domain is required")
        .max(253, "Host is too long"),
    port: z
        .string()
        .trim()
        .regex(/^\d+$/, "Port must be a number")
        .refine((value) => {
            const port = Number(value)
            return port >= 1 && port <= 65535
        }, "Port must be between 1 and 65535"),
})

type WarmupMode = 'low' | 'medium' | 'fast'

const passwordSchema = z.object({
    password: z.string().min(1, "Password is required"),
})

const DELETE_CONFIRM_PHRASE = "DELETE"

export function ServerClient({ initialData }: { initialData: ServerNode[] }) {
    const storeServers = useServerStore(state => state.servers)
    const setServers = useServerStore(state => state.setServers)
    // Same pattern as JobsClient: fall back to SSR data until the store hydrates
    const servers = storeServers.length > 0 ? storeServers : initialData
    
    // Connect to WebSocket to receive real-time server_list_update events
    useServerWebSocket()
    
    const [isLoading, setIsLoading] = useState(false)
    const [workerKey, setWorkerKey] = useState("")
    const [isKeyLoading, setIsKeyLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showAddForm, setShowAddForm] = useState(false)
    const [showApiKey, setShowApiKey] = useState(false)
    const [passwordModal, setPasswordModal] = useState<"reveal" | "rotate" | null>(null)
    const [manageServer, setManageServer] = useState<ServerNode | null>(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [deleteConfirmText, setDeleteConfirmText] = useState("")
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [warmupMode, setWarmupMode] = useState<WarmupMode>('medium')
    const [warmupEnabled, setWarmupEnabled] = useState(true)
    const [warmupSaving, setWarmupSaving] = useState(false)
    const [rateLimitRpm, setRateLimitRpm] = useState(0)

    const addForm = useForm<z.infer<typeof addServerSchema>>({
        resolver: zodResolver(addServerSchema),
        defaultValues: { name: "", ip: "", port: "8080" }
    })


    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { password: "" }
    })

    useEffect(() => {
        if (initialData.length > 0) {
            setServers(initialData)
        }
    }, [initialData, setServers])

    useEffect(() => {
        void fetchServers(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only refresh
    }, [])

    useEffect(() => {
        const onFocus = () => {
            void fetchServers(true)
        }
        window.addEventListener("focus", onFocus)
        return () => window.removeEventListener("focus", onFocus)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- focus listener should not re-bind on fetchServers change
    }, [])

    useEffect(() => {
        if (manageServer) {
            setWarmupEnabled(manageServer.warmup_enabled ?? true)
            setWarmupMode(manageServer.warmup_mode || 'medium')
            setDeleteConfirmText("")
            setShowDeleteConfirm(false)
            const rpm = manageServer.config?.rateLimit
            setRateLimitRpm(typeof rpm === 'number' && rpm >= 0 ? rpm : 0)
        }
    }, [manageServer])

    useEffect(() => {
        if (passwordModal) {
            passwordForm.reset({ password: "" })
        }
    }, [passwordModal, passwordForm])

    const filteredServers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase()
        if (!query) {
            return servers
        }

        return servers.filter((server) => {
            const haystack = [
                server.name,
                server.address,
                `${server.address}:${server.port}`,
                server.status,
                server.currentJob,
                server.ipReputation,
            ].join(" ").toLowerCase()
            return haystack.includes(query)
        })
    }, [servers, searchTerm])

    const fetchServers = async (silent = true) => {
        const current = useServerStore.getState().servers
        const hasVisibleRows = (current.length > 0 ? current : initialData).length > 0
        if (!silent || !hasVisibleRows) {
            setIsLoading(true)
        }
        try {
            const result = await ApiClient.get<ServerNode[]>('/admin/server/list');
            if (result.status === 'success') {
                const data = Array.isArray(result.data) ? result.data : [];
                setServers(data);
            }
        } catch (error) {
            console.error("Failed to fetch servers:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const onAddServer = async (values: z.infer<typeof addServerSchema>) => {
        try {
            const portNum = Number(values.port);

            const result = await ApiClient.post('/admin/server/add', {
                server_name: values.name.trim(),
                ip_address: values.ip.trim(),
                port: portNum,
            });

            if (result.status === 'success') {
                toast.success("Worker server added successfully");
                setShowAddForm(false);
                addForm.reset();
                void fetchServers();
            } else {
                toast.error(result.message || "Failed to add server");
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error adding server");
        }
    }

    const handleToggleServer = async (id: number, enable: boolean) => {
        try {
            const result = await ApiClient.post('/admin/server/toggle', {
                id,
                enabled: enable
            });

            if (result.status === 'success') {
                toast.success(enable ? "Server enabled" : "Server disabled");
                void fetchServers();
            } else {
                toast.error(result.message || "Failed to toggle server status");
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error toggling server status");
        }
    }

    const doDeleteServer = async () => {
        if (!manageServer) return;
        if (deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
            toast.error(`Type ${DELETE_CONFIRM_PHRASE} to confirm`);
            return;
        }

        const id = manageServer.id;
        setManageServer(null);
        setDeleteConfirmText("");

        const toastId = toast.loading("Deleting server...");
        try {
            const result = await ApiClient.post('/admin/server/delete', {
                id,
                confirm: DELETE_CONFIRM_PHRASE,
            });

            if (result.status === 'success') {
                toast.success("Server deleted successfully", { id: toastId });
                void fetchServers();
            } else {
                toast.error(result.message || "Failed to delete server", { id: toastId });
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error deleting server", { id: toastId });
        }
    }

    const onPasswordAction = async (values: z.infer<typeof passwordSchema>) => {
        if (!passwordModal) return;

        setIsKeyLoading(true);
        try {
            if (passwordModal === "reveal") {
                const result = await ApiClient.post<{ worker_key?: string }>('/admin/server/worker-key/reveal', {
                    password: values.password,
                });
                if (result.status === 'success') {
                    setWorkerKey(result.data?.worker_key || "");
                    setShowApiKey(true);
                    setPasswordModal(null);
                    passwordForm.reset();
                    toast.success("Worker key revealed");
                } else {
                    toast.error(result.message || "Failed to reveal worker key");
                }
                return;
            }

            const result = await ApiClient.post<{ worker_key?: string }>('/admin/server/worker-key/rotate', {
                password: values.password,
            });

            if (result.status === 'success') {
                setWorkerKey(result.data?.worker_key || "");
                setShowApiKey(true);
                setPasswordModal(null);
                passwordForm.reset();
                setCopied(false);
                toast.success("Worker key rotated successfully.");
            } else {
                toast.error(result.message || "Failed to rotate worker key.");
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Password verification failed");
        } finally {
            setIsKeyLoading(false);
        }
    }

    const toggleReveal = () => {
        if (showApiKey) {
            setShowApiKey(false);
            return;
        }

        if (workerKey) {
            setShowApiKey(true);
            return;
        }

        setPasswordModal("reveal");
    };

    const copyToClipboard = async () => {
        if (!workerKey) {
            toast.error("Reveal the key first to copy it.");
            setPasswordModal("reveal");
            return;
        }

        try {
            await navigator.clipboard.writeText(workerKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Copied to clipboard");
        } catch {
            toast.error("Clipboard permission denied");
        }
    }

    const handleWarmupSave = async () => {
        if (!manageServer) return
        if (!Number.isFinite(rateLimitRpm) || rateLimitRpm < 0 || rateLimitRpm > 1_000_000) {
            toast.error("Rate limit must be 0 (unlimited) or 1–1000000 per minute")
            return
        }
        setWarmupSaving(true)
        try {
            const [warmupResult, rateResult] = await Promise.all([
                ApiClient.post('/admin/server/warmup', {
                    id: manageServer.id,
                    warmup_enabled: warmupEnabled,
                    warmup_mode: warmupMode,
                }),
                ApiClient.post('/admin/server/update', {
                    id: manageServer.id,
                    config: { rateLimit: Math.floor(rateLimitRpm) },
                }),
            ])
            if (warmupResult.status === 'success' && rateResult.status === 'success') {
                setManageServer(null)
                void fetchServers()
                toast.success("Server settings saved. Rate limit applies on next worker heartbeat (~1 min).")
            } else {
                toast.error(warmupResult.message || rateResult.message || "Failed to save server settings.")
            }
        } catch (error) {
            console.error("Failed to save server settings:", error)
            toast.error("Failed to save server settings.")
        } finally {
            setWarmupSaving(false)
        }
    }

    const canConfirmDelete = deleteConfirmText.trim().toUpperCase() === DELETE_CONFIRM_PHRASE

    type DisplayStatus = "active" | "warmup" | "offline" | "inactive"

    const isWarmupInProgress = (server: ServerNode) => {
        if (!server.warmup_enabled) return false
        const stage = (server.warmup_stage || "").toLowerCase()
        if (stage.startsWith("completed") || stage.startsWith("disabled")) return false
        return true
    }

    const resolveDisplayStatus = (server: ServerNode): DisplayStatus => {
        if (server.status === "disabled" || server.config?.enabled === false) return "inactive"
        if (server.status === "offline") return "offline"
        if (server.status === "active" && isWarmupInProgress(server)) return "warmup"
        if (server.status === "active") return "active"
        return "offline"
    }

    const statusBadge = (display: DisplayStatus) => {
        switch (display) {
            case "active":
                return {
                    label: "Active",
                    className: "bg-green-100 text-green-700 hover:bg-green-100 border-green-200",
                    dot: "bg-green-500 animate-pulse",
                }
            case "warmup":
                return {
                    label: "Warmup",
                    className: "bg-orange-50 text-orange-700 hover:bg-orange-50 border-orange-200",
                    dot: "bg-orange-500 animate-pulse",
                }
            case "inactive":
                return {
                    label: "Disabled",
                    className: "bg-amber-50 text-amber-800 hover:bg-amber-50 border-amber-200",
                    dot: "bg-amber-500",
                }
            default:
                return {
                    label: "Offline",
                    className: "bg-slate-100 text-slate-600 border-slate-200",
                    dot: "bg-slate-400",
                }
        }
    }

    const statusCounts = useMemo(() => {
        let active = 0
        let warmup = 0
        let offline = 0
        let inactive = 0
        for (const s of filteredServers) {
            switch (resolveDisplayStatus(s)) {
                case "active":
                    active++
                    break
                case "warmup":
                    warmup++
                    break
                case "inactive":
                    inactive++
                    break
                default:
                    offline++
            }
        }
        return { active, warmup, offline, inactive }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveDisplayStatus is stable pure helper
    }, [filteredServers])

    return (
        <div className="flex-1 space-y-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Worker Servers</h2>
                    <p className="text-sm text-[#5a736c]">Centrally manage and monitor your distributed verification infrastructure.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void fetchServers(false); }}
                        disabled={isLoading}
                        className="border-[#0b1f1c]/15 text-[#0b1f1c]"
                    >
                        <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button
                        onClick={() => {
                            setShowAddForm(true);
                            addForm.reset();
                        }}
                        className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none transition-all active:scale-95"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add New Server
                    </Button>
                </div>
            </div>

            {/* Settings & Actions Modal */}
            {manageServer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/95 overflow-hidden">

                            {/* Header */}
                            <CardHeader className="bg-[#f0f4f2]/70 border-b border-[#0b1f1c]/8 pb-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-2.5">
                                        <CardTitle className="text-lg font-bold text-[#0b1f1c] tracking-tight">Settings &amp; Actions</CardTitle>
                                        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-0.5">
                                            <span className="font-mono text-xs font-semibold text-slate-600">{manageServer.name}</span>
                                            <span className="text-slate-300">•</span>
                                            <span className="font-mono text-[11px] text-slate-400">{manageServer.address}</span>
                                            <span className="hidden sm:inline text-slate-300">•</span>
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="relative group/tip inline-flex">
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                                                        aria-label="VPS rate limit help"
                                                    >
                                                        <Info className="h-3.5 w-3.5" />
                                                    </button>
                                                    <span
                                                        role="tooltip"
                                                        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] leading-relaxed text-slate-600 shadow-md opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
                                                    >
                                                        Match your VPS provider cap (e.g. 25). Use 0 for unlimited.
                                                        Does not change Job Control concurrency or domain RPS — only caps this node&apos;s outbound SMTP.
                                                    </span>
                                                </span>
                                                <Label htmlFor="rate_limit_rpm" className="sr-only">
                                                    Verifies per minute
                                                </Label>
                                                <Input
                                                    id="rate_limit_rpm"
                                                    type="number"
                                                    min={0}
                                                    max={1000000}
                                                    step={1}
                                                    value={rateLimitRpm}
                                                    onChange={(e) => setRateLimitRpm(Number(e.target.value))}
                                                    className="h-7 w-[4.75rem] font-mono text-xs bg-white border-slate-200 focus-visible:ring-amber-400/40"
                                                />
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                                    /min
                                                </span>
                                            </span>
                                        </CardDescription>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setManageServer(null)} className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700">
                                        <Plus className="h-5 w-5 rotate-45" />
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-5 pt-5 pb-5">

                                {/* ── IP Warmup Section ── */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <Flame className="h-4 w-4 text-orange-500" />
                                            <span className="text-[11px] font-bold text-[#0b1f1c] uppercase tracking-widest">IP Warmup</span>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <span className={`text-[11px] font-semibold ${warmupEnabled ? 'text-[#0f5c52]' : 'text-slate-400'}`}>
                                                {warmupEnabled ? 'Active' : 'Off'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setWarmupEnabled(v => !v)}
                                                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                                                    warmupEnabled ? 'bg-[#0f5c52]' : 'bg-slate-200'
                                                }`}
                                            >
                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                                    warmupEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                                }`} />
                                            </button>
                                        </label>
                                    </div>

                                    {/* 3 Mode Selector Cards */}
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { key: 'low'    as WarmupMode, emoji: '🐢', label: 'Low (Safe)',    speed: '1–3 → 3–5 → 5–10', duration: '7 days', activeClass: 'border-blue-400 bg-blue-50/70 shadow-blue-100',    checkBg: 'bg-blue-500',    labelClass: 'text-blue-700'    },
                                            { key: 'medium' as WarmupMode, emoji: '⚡', label: 'Medium (Std)', speed: '2–4 → 4–8 → 8–15', duration: '7 days', activeClass: 'border-[#0f5c52] bg-[#0f5c52]/8 shadow-teal-100', checkBg: 'bg-[#0f5c52]',   labelClass: 'text-[#0f5c52]'  },
                                            { key: 'fast'   as WarmupMode, emoji: '🚀', label: 'Fast',         speed: '3–5 → 5–10 → Max',  duration: '5 days', activeClass: 'border-violet-400 bg-violet-50/70 shadow-violet-100', checkBg: 'bg-violet-500', labelClass: 'text-violet-700' },
                                        ] as const).map((mode) => {
                                            const isSelected = warmupMode === mode.key && warmupEnabled
                                            return (
                                                <button
                                                    key={mode.key}
                                                    type="button"
                                                    disabled={!warmupEnabled}
                                                    onClick={() => setWarmupMode(mode.key)}
                                                    className={`relative flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all duration-200 text-center shadow-sm ${
                                                        isSelected
                                                            ? mode.activeClass
                                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                                                    } ${!warmupEnabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                                                >
                                                    {isSelected && (
                                                        <span className={`absolute -top-1.5 -right-1.5 h-4 w-4 ${mode.checkBg} rounded-full flex items-center justify-center shadow-md`}>
                                                            <Check className="h-2.5 w-2.5 text-white" />
                                                        </span>
                                                    )}
                                                    <span className="text-xl leading-none">{mode.emoji}</span>
                                                    <span className={`text-[11px] font-bold mt-1 ${isSelected ? mode.labelClass : 'text-slate-600'}`}>{mode.label}</span>
                                                    <span className="text-[9px] text-slate-500 font-medium">{mode.speed}</span>
                                                    <span className="text-[9px] text-slate-400 font-semibold">{mode.duration}</span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Warmup Info Banner */}
                                    {warmupEnabled && (
                                        <div className="flex items-start gap-2.5 bg-[#0f5c52]/6 border border-[#0f5c52]/18 rounded-lg px-3 py-2.5">
                                            <TrendingUp className="h-3.5 w-3.5 text-[#0f5c52] mt-0.5 flex-shrink-0" />
                                            <div className="space-y-0.5 min-w-0">
                                                <p className="text-[11px] font-semibold text-[#0b1f1c]">
                                                    {warmupMode === 'low'
                                                        ? 'Low — Days 1–2: 1–3 conc (Tier 1) • Days 3–5: 3–5 conc (Tier 1+2) • Days 6–7: 5–10 conc (All Tiers)'
                                                        : warmupMode === 'medium'
                                                        ? 'Medium — Days 1–2: 2–4 conc (Tier 1) • Days 3–5: 4–8 conc (Tier 1+2) • Days 6–7: 8–15 conc (All Tiers)'
                                                        : 'Fast — Days 1–2: 3–5 conc (Tier 1+2) • Days 3–4: 5–10 conc (All Tiers)'}
                                                </p>
                                                {manageServer.warmup_stage && (
                                                    <p className="text-[10px] font-semibold text-orange-700 flex items-center gap-1">
                                                        <Flame className="h-3 w-3" />
                                                        Current: {manageServer.warmup_stage}
                                                    </p>
                                                )}
                                                <p className="text-[10px] text-slate-500">When warmup finishes or is turned off, Status column shows Active.</p>
                                            </div>
                                        </div>
                                    )}
                                    {!warmupEnabled && (
                                        <p className="text-[10px] text-slate-400 italic text-center">
                                            Warmup disabled — status shows Active while the node is online.
                                        </p>
                                    )}
                                </div>

                                <Separator className="bg-slate-100" />

                                {/* ── Node Status + Save ── */}
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Node Status</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {(() => {
                                                const d = resolveDisplayStatus(manageServer)
                                                if (d === "warmup") return `Warmup · ${manageServer.warmup_stage || "in progress"}`
                                                if (d === "active") return "Active — full capacity"
                                                if (d === "inactive") return "Disabled — admin turned off"
                                                return "Offline — no recent heartbeat"
                                            })()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            onClick={() => { void handleWarmupSave() }}
                                            disabled={warmupSaving}
                                            size="sm"
                                            className="h-8 px-4 border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white font-bold text-[11px] uppercase tracking-wider shadow-none"
                                        >
                                            {warmupSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => { void handleToggleServer(manageServer.id, !manageServer.config.enabled); setManageServer(null); }}
                                            size="sm"
                                            className={`h-8 px-4 font-bold text-[11px] uppercase tracking-wider shadow-none border ${
                                                manageServer.config.enabled
                                                    ? 'bg-slate-800 hover:bg-slate-900 text-white border-slate-700'
                                                    : 'bg-[#0f5c52] hover:bg-[#0b4a42] text-white border-[#08352f]'
                                            }`}
                                        >
                                            {manageServer.config.enabled ? 'Disable' : 'Enable'}
                                        </Button>
                                    </div>
                                </div>

                                {/* ── Danger Zone ── */}
                                <div className="pt-4 border-t border-red-100/70">
                                    {!showDeleteConfirm ? (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[11px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Danger Zone
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    Permanently remove this server node from your cluster.
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => setShowDeleteConfirm(true)}
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-bold text-[11px] uppercase tracking-wider shadow-none"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Node
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 bg-red-50/50 p-3.5 rounded-xl border border-red-200/80">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[11px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Confirm Deletion
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                                                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-slate-600">
                                                Type <span className="font-mono font-bold text-red-600">{DELETE_CONFIRM_PHRASE}</span> to confirm permanent node deletion:
                                            </p>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={deleteConfirmText}
                                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                                    placeholder={DELETE_CONFIRM_PHRASE}
                                                    className="font-mono text-xs border-red-300 focus-visible:ring-red-400 h-8 bg-white"
                                                    autoComplete="off"
                                                />
                                                <Button
                                                    type="button"
                                                    onClick={() => { void doDeleteServer() }}
                                                    disabled={!canConfirmDelete}
                                                    variant="destructive"
                                                    size="sm"
                                                    className="h-8 px-4 font-bold uppercase tracking-wider text-[11px] shadow-none flex-shrink-0"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Worker API Key Card */}
            <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <ShieldCheck className="h-32 w-32 text-[#0b1f1c]" />
                </div>
                <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="p-1.5 bg-[#0f5c52]/10 rounded-lg border border-[#0f5c52]/20 flex-shrink-0">
                                <ShieldCheck className="h-5 w-5 text-[#0f5c52]" />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1">
                                <span className="text-sm font-semibold text-[#0b1f1c] whitespace-nowrap">Universal API Key</span>
                                <span className="hidden sm:block h-3 w-[1px] bg-slate-200" />
                                <span className="text-xs text-[#5a736c] italic">Required for all backend worker servers to communicate with this dashboard.</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50/50 p-2 rounded-lg border border-[#0b1f1c]/8 min-w-[320px] lg:min-w-[400px]">
                            <code className="flex-1 font-mono text-xs text-slate-700 bg-transparent truncate select-all px-2">
                                {showApiKey ? (workerKey || (isKeyLoading ? "Loading..." : "Unavailable")) : "••••••••••••••••••••••••••••••••••••••••"}
                            </code>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleReveal}
                                    disabled={isKeyLoading}
                                    className="h-8 w-8 text-slate-400 hover:text-[#0f5c52] hover:bg-[#0f5c52]/10"
                                    title={showApiKey ? "Hide Key" : "Reveal Key"}
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Separator orientation="vertical" className="h-5 bg-[#0b1f1c]/10" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setPasswordModal("rotate")}
                                    className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                    title="Regenerate Key"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                </Button>
                                <Separator orientation="vertical" className="h-5 bg-[#0b1f1c]/10" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { void copyToClipboard(); }}
                                    disabled={isKeyLoading}
                                    className="h-8 text-[#0f5c52] hover:text-[#0b4a42] hover:bg-[#0f5c52]/10 font-semibold px-3"
                                >
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    <span className="ml-2 text-xs">{copied ? "Copied" : "Copy"}</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Add Server Modal (Popup) */}
            {showAddForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden">
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="text-xl font-bold text-[#0b1f1c]">Add New Worker</CardTitle>
                                <CardDescription>Register a new backend node to your verification fleet.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <form onSubmit={addForm.handleSubmit(onAddServer)}>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="server-name" className="text-sm font-semibold text-slate-700">Display Name</Label>
                                            <Input
                                                id="server-name" placeholder="e.g. Primary Node - US"
                                                className={`focus-visible:ring-[#0f5c52]/30 ${addForm.formState.errors.name ? 'border-red-400' : 'border-[#0b1f1c]/10'}`}
                                                {...addForm.register("name")}
                                            />
                                            {addForm.formState.errors.name && <p className="text-xs text-red-500">{addForm.formState.errors.name.message}</p>}
                                            <p className="text-[11px] text-slate-500">Use the same value in the worker&apos;s `WORKER_SERVER_NAME` setting, or keep the machine hostname.</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                            <div className="sm:col-span-3 space-y-2">
                                                <Label htmlFor="server-address" className="text-sm font-semibold text-slate-700">IP or Domain</Label>
                                                <Input
                                                    id="server-address" placeholder="123.45.67.89"
                                                    className={`focus-visible:ring-[#0f5c52]/30 ${addForm.formState.errors.ip ? 'border-red-400' : 'border-[#0b1f1c]/10'}`}
                                                    {...addForm.register("ip")}
                                                />
                                                {addForm.formState.errors.ip && <p className="text-xs text-red-500">{addForm.formState.errors.ip.message}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="server-port" className="text-sm font-semibold text-slate-700">Port</Label>
                                                <Input
                                                    id="server-port" placeholder="8080"
                                                    className={`focus-visible:ring-[#0f5c52]/30 ${addForm.formState.errors.port ? 'border-red-400' : 'border-[#0b1f1c]/10'}`}
                                                    {...addForm.register("port")}
                                                />
                                                {addForm.formState.errors.port && <p className="text-xs text-red-500">{addForm.formState.errors.port.message}</p>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                        <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} className="px-6">Cancel</Button>
                                        <Button
                                            type="submit"
                                            disabled={addForm.formState.isSubmitting}
                                            className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white px-6 font-bold"
                                        >
                                            {addForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect Server"}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Password step-up for reveal / rotate */}
            {passwordModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden">
                            <CardHeader className="bg-amber-50/50 border-b border-amber-100/50">
                                <CardTitle className="text-xl font-bold text-[#0b1f1c] flex items-center gap-2">
                                    <Lock className="h-5 w-5 text-amber-600" />
                                    Security Verification
                                </CardTitle>
                                <CardDescription>
                                    {passwordModal === "reveal"
                                        ? "Enter your administrator password to reveal the universal worker API key."
                                        : "Enter your administrator password to regenerate the universal API key for all backend worker servers."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-6">
                                <form onSubmit={passwordForm.handleSubmit(onPasswordAction)}>
                                    <div className="space-y-2">
                                        <Label htmlFor="admin-password" className="font-semibold text-slate-700">Admin Password</Label>
                                        <Input
                                            id="admin-password"
                                            type="password"
                                            placeholder="Enter password..."
                                            className={`focus-visible:ring-[#0f5c52]/30 ${passwordForm.formState.errors.password ? 'border-red-400' : 'border-[#0b1f1c]/10'}`}
                                            {...passwordForm.register("password")}
                                        />
                                        {passwordForm.formState.errors.password && (
                                            <p className="text-xs text-red-500 flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" />
                                                {passwordForm.formState.errors.password.message}
                                            </p>
                                        )}
                                        {passwordModal === "rotate" && (
                                            <p className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic mt-2">
                                                Warning: Regenerating this API key will immediately disconnect all backend worker servers until they are updated with the new key.
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                        <Button type="button" variant="outline" onClick={() => setPasswordModal(null)} className="px-6">Cancel</Button>
                                        <Button
                                            type="submit"
                                            disabled={passwordForm.formState.isSubmitting || isKeyLoading}
                                            className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white px-6 font-bold"
                                        >
                                            {(passwordForm.formState.isSubmitting || isKeyLoading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                            {passwordModal === "reveal" ? "Reveal Key" : "Regenerate Key"}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* Servers List View */}
            <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden">
                <div className="p-4 border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            id="server-search"
                            name="serverSearch"
                            aria-label="Search servers"
                            placeholder="Search servers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 text-sm bg-white focus-visible:ring-[#0f5c52]/30 border-[#0b1f1c]/10"
                        />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant="outline" className="bg-white text-slate-600 font-medium border-[#0b1f1c]/10">
                            Total: {filteredServers.length}
                        </Badge>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-100 font-medium">
                            Active: {statusCounts.active}
                        </Badge>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-100 font-medium">
                            Warmup: {statusCounts.warmup}
                        </Badge>
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-medium">
                            Offline: {statusCounts.offline}
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-100 font-medium">
                            Disabled: {statusCounts.inactive}
                        </Badge>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-[#f0f4f2]/60 hover:bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <TableHead className="w-[300px] font-semibold text-slate-900">Server Node</TableHead>
                                <TableHead className="w-[100px] font-semibold text-slate-900 text-center">Status</TableHead>
                                <TableHead className="w-[160px] font-semibold text-slate-900">Verified Today</TableHead>
                                <TableHead className="min-w-[150px] font-semibold text-slate-900">Current Activity</TableHead>
                                <TableHead className="w-[150px] font-semibold text-slate-900 text-center">IP Reputation</TableHead>
                                <TableHead className="w-[120px] font-semibold text-slate-900 text-center">Worker Count</TableHead>
                                <TableHead className="w-[280px] font-semibold text-slate-900 text-right">Settings & Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredServers.map((server) => {
                                const verifiedToday = Math.max(0, server.emailsVerifiedToday ?? 0)
                                const displayStatus = resolveDisplayStatus(server)
                                const badge = statusBadge(displayStatus)
                                const isOnline = displayStatus === "active" || displayStatus === "warmup"
                                const isInactive = displayStatus === "inactive"
                                const isWarmup = displayStatus === "warmup"

                                return (
                                <TableRow key={server.id} className="group hover:bg-slate-50/30 transition-colors border-b border-slate-50">
                                    <TableCell>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-[#0f5c52]/10 group-hover:text-[#0f5c52] transition-all duration-300 border border-transparent group-hover:border-[#0f5c52]/20">
                                                <Server className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900 group-hover:text-[#0b4a42] transition-colors">{server.name}</p>
                                                <div className="flex items-center text-[10px] text-slate-500 gap-2 mt-0.5">
                                                    <span className="flex items-center gap-1 font-mono uppercase bg-slate-100 px-1 rounded border border-slate-200/50">
                                                        <Globe className="h-2.5 w-2.5 text-slate-400" /> {server.address}:{server.port}
                                                    </span>
                                                    <Separator orientation="vertical" className="h-3 bg-slate-200" />
                                                    <span className="flex items-center gap-1 font-medium"><Clock className="h-2.5 w-2.5 text-slate-400" /> {server.runningTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <Badge variant={isOnline ? "default" : "secondary"} className={badge.className}>
                                                <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${badge.dot}`} />
                                                {isWarmup && <Flame className="h-3 w-3 mr-1" />}
                                                {badge.label}
                                            </Badge>
                                            {displayStatus === "active" && (
                                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                    <Signal className="h-2.5 w-2.5" /> {server.ping === "live" ? "Live" : server.ping}
                                                </span>
                                            )}
                                            {isWarmup && (
                                                <span className="text-[10px] text-orange-700/80 font-medium max-w-[140px] truncate" title={server.warmup_stage}>
                                                    {(server.warmup_mode || "medium").toUpperCase()} · {server.warmup_stage || "In progress"}
                                                </span>
                                            )}
                                            {isInactive && (
                                                <span className="text-[10px] text-amber-700/80 font-medium">Admin off</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <Database className="h-3.5 w-3.5 text-[#0f5c52]" />
                                                <span className="text-sm font-bold text-slate-800 tabular-nums">
                                                    {verifiedToday.toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400">emails verified today (UTC)</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 max-w-[220px] bg-slate-50/50 p-2 rounded border border-slate-100 group-hover:border-[#0f5c52]/20 group-hover:bg-[#0f5c52]/5 transition-all">
                                            <Zap className={`h-3.5 w-3.5 flex-shrink-0 ${isOnline ? "text-amber-500 animate-pulse" : "text-slate-300"}`} />
                                            <div className="overflow-hidden">
                                                <p className="text-[10px] font-bold text-slate-700 truncate uppercase tracking-tighter">
                                                    {isOnline ? "Processing" : isInactive ? "Disabled" : "Idle"}
                                                </p>
                                                <p className="text-[10px] text-slate-500 truncate italic">
                                                    {isOnline ? server.currentJob : isInactive ? "Not accepting jobs" : "--"}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {isOnline ? (
                                            <Badge variant="outline" className={`
                                                ${server.ipReputation === 'Good' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    server.ipReputation === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        server.ipReputation === 'Low' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                            server.ipReputation === 'Blacklist' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                'bg-slate-50 text-slate-600 border-slate-200'}
                                                font-bold text-[10px] uppercase
                                            `}>
                                                {server.ipReputation}
                                            </Badge>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 font-bold uppercase">None</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={`text-sm font-bold ${isOnline ? 'text-slate-700' : 'text-slate-300'}`}>
                                                {isOnline ? server.workerCount : 0}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            onClick={() => setManageServer(server)}
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-[#0f5c52] hover:bg-[#0f5c52]/10"
                                            title="Manage Server"
                                        >
                                            <Settings2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                )
                            })}
                            {isLoading && filteredServers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                                        Loading servers...
                                    </TableCell>
                                </TableRow>
                            )}
                            {!isLoading && filteredServers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                                        No servers matched your search.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="p-4 bg-[#f0f4f2]/60 border-t border-[#0b1f1c]/8 flex items-center justify-between">
                    <p className="text-[11px] text-slate-500 flex items-center gap-2 font-medium">
                        <Activity className="h-3 w-3 text-[#0f5c52]" /> System heartbeats active
                    </p>
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nodes Synced</span>
                    </div>
                </div>
            </Card>
        </div>
    )
}
