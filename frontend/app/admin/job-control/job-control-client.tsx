"use client"

import { useState, useEffect, useCallback } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import {
    Save,
    Settings2,
    Trash2,
    Download,
    RefreshCcw,
    Database,
    ShieldCheck,
    Clock,
    Calendar,
    AlertCircle,
    CheckCircle2,
    Layers,
    ChevronDown,
    Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

const settingsSchema = z.object({
    chunk_tier1_max_list: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier1_size: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier1_timeout: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier2_max_list: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier2_size: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier2_timeout: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier3_max_list: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier3_size: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    chunk_tier3_timeout: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number"),
    max_emails_per_job: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number")
        .refine((v) => {
            const n = Number(v)
            return n >= 10 && n <= 1000000
        }, "Must be between 10 and 1,000,000"),
    max_active_jobs_per_user: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number")
        .refine((v) => {
            const n = Number(v)
            return n >= 0 && n <= 10000
        }, "Must be between 0 and 10000"),
    prepare_concurrency: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number")
        .refine((v) => {
            const n = Number(v)
            return n >= 1 && n <= 10
        }, "Must be between 1 and 10"),
    worker_concurrency: z
        .string()
        .min(1, "Required")
        .regex(/^\d+$/, "Must be a number")
        .refine((v) => {
            const n = Number(v)
            return n >= 1 && n <= 100
        }, "Must be between 1 and 100"),
})

type JobOverview = {
    processed_emails?: string | number
    total_emails?: string | number
    total_jobs?: number
    processed_today?: string | number
    jobs_today?: number
    processed_30d?: string | number
    jobs_30d?: number
}

type JobBreakdown = {
    valid?: number
    unknown?: number
    invalid?: number
    catch_all?: number
    disposable?: number
}

type JobStats = {
    overview?: JobOverview
    breakdown?: JobBreakdown
}

type SettingRow = {
    setting_key: string
    setting_value: string
}

const DELETE_CONFIRM_PHRASE = "DELETE"
const EXPORT_DAYS = 90
const ALLOWED_CLEANUP_DAYS = new Set(["7", "14", "21", "30"])

function asCount(value: string | number | undefined): number {
    if (typeof value === "number") return value
    return parseInt(value || "0", 10) || 0
}

export function JobControlClient({ initialSettings, initialStats }: { initialSettings: Record<string, string>, initialStats: JobStats | null }) {
    const settingsForm = useForm<z.infer<typeof settingsSchema>>({
        resolver: zodResolver(settingsSchema),
        defaultValues: {
            chunk_tier1_max_list: initialSettings.chunk_tier1_max_list || "50000",
            chunk_tier1_size: initialSettings.chunk_tier1_size || "100",
            chunk_tier1_timeout: initialSettings.chunk_tier1_timeout || "15",
            chunk_tier2_max_list: initialSettings.chunk_tier2_max_list || "100000",
            chunk_tier2_size: initialSettings.chunk_tier2_size || "500",
            chunk_tier2_timeout: initialSettings.chunk_tier2_timeout || "60",
            chunk_tier3_max_list: initialSettings.chunk_tier3_max_list || "500000",
            chunk_tier3_size: initialSettings.chunk_tier3_size || "1000",
            chunk_tier3_timeout: initialSettings.chunk_tier3_timeout || "120",
            max_emails_per_job: initialSettings.max_emails_per_job || "100000",
            max_active_jobs_per_user: initialSettings.max_active_jobs_per_user || "0",
            prepare_concurrency: initialSettings.prepare_concurrency || "1",
            worker_concurrency: initialSettings.worker_concurrency || "10",
        }
    })

    const [stats, setStats] = useState<JobStats | null>(initialStats)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [isCleaning, setIsCleaning] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

    const [showCleanupModal, setShowCleanupModal] = useState(false)
    const [cleanupDays, setCleanupDays] = useState("7")
    const [cleanupConfirmText, setCleanupConfirmText] = useState("")
    const [cleanupStep, setCleanupStep] = useState<'confirm' | 'deleting' | 'success'>('confirm')
    const [deletedCount, setDeletedCount] = useState(0)
    const [filesPurged, setFilesPurged] = useState(0)

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [settingsRes, statsRes] = await Promise.all([
                ApiClient.get<SettingRow[]>('/admin/settings'),
                ApiClient.get<JobStats>('/admin/jobs/stats')
            ]);

            if (settingsRes.status === 'success' && Array.isArray(settingsRes.data)) {
                const mappedSettings: Record<string, string> = {};
                settingsRes.data.forEach((s: SettingRow) => {
                    mappedSettings[s.setting_key] = s.setting_value;
                });

                settingsForm.reset({
                    chunk_tier1_max_list: mappedSettings.chunk_tier1_max_list || "50000",
                    chunk_tier1_size: mappedSettings.chunk_tier1_size || "100",
                    chunk_tier1_timeout: mappedSettings.chunk_tier1_timeout || "15",
                    chunk_tier2_max_list: mappedSettings.chunk_tier2_max_list || "100000",
                    chunk_tier2_size: mappedSettings.chunk_tier2_size || "500",
                    chunk_tier2_timeout: mappedSettings.chunk_tier2_timeout || "60",
                    chunk_tier3_max_list: mappedSettings.chunk_tier3_max_list || "500000",
                    chunk_tier3_size: mappedSettings.chunk_tier3_size || "1000",
                    chunk_tier3_timeout: mappedSettings.chunk_tier3_timeout || "120",
                    max_emails_per_job: mappedSettings.max_emails_per_job || "100000",
                    max_active_jobs_per_user: mappedSettings.max_active_jobs_per_user || "0",
                    prepare_concurrency: mappedSettings.prepare_concurrency || "1",
                    worker_concurrency: mappedSettings.worker_concurrency || "10",
                });
            }

            if (statsRes.status === 'success' && statsRes.data) {
                setStats(statsRes.data);
            } else if (statsRes.status === 'error') {
                toast.error(statsRes.message || "Failed to load job stats");
            }
            setLastRefreshed(new Date());
        } catch (error) {
            console.error("Failed to fetch data:", error);
            toast.error(error instanceof Error ? error.message : "Failed to refresh job control data");
        } finally {
            setIsLoading(false);
        }
    }, [settingsForm]);

    useEffect(() => {
        if (initialSettings) {
            settingsForm.reset({
                chunk_tier1_max_list: initialSettings.chunk_tier1_max_list || "50000",
                chunk_tier1_size: initialSettings.chunk_tier1_size || "100",
                chunk_tier1_timeout: initialSettings.chunk_tier1_timeout || "15",
                chunk_tier2_max_list: initialSettings.chunk_tier2_max_list || "100000",
                chunk_tier2_size: initialSettings.chunk_tier2_size || "500",
                chunk_tier2_timeout: initialSettings.chunk_tier2_timeout || "60",
                chunk_tier3_max_list: initialSettings.chunk_tier3_max_list || "500000",
                chunk_tier3_size: initialSettings.chunk_tier3_size || "1000",
                chunk_tier3_timeout: initialSettings.chunk_tier3_timeout || "120",
                max_emails_per_job: initialSettings.max_emails_per_job || "100000",
                max_active_jobs_per_user: initialSettings.max_active_jobs_per_user || "0",
                prepare_concurrency: initialSettings.prepare_concurrency || "1",
                worker_concurrency: initialSettings.worker_concurrency || "10",
            });
        }
        if (initialStats) {
            setStats(initialStats);
        }
    }, [initialSettings, initialStats, settingsForm]);

    useEffect(() => {
        // Skip redundant mount fetch when RSC already hydrated settings/stats (L1).
        const hasSSR = Boolean(initialStats) || Object.keys(initialSettings).length > 0
        if (hasSSR) {
            return
        }
        void fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only when SSR empty
    }, [])

    const onSaveSettings = async (values: z.infer<typeof settingsSchema>) => {
        setIsSaved(false);
        try {
            const result = await ApiClient.post('/admin/settings/update', {
                settings: values
            });
            if (result.status === 'success') {
                setIsSaved(true);
                setTimeout(() => setIsSaved(false), 2000);
                toast.success("Settings updated successfully");
                void fetchData();
            } else {
                toast.error(result.message || "Failed to save settings");
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Error saving settings");
        }
    };

    const openCleanupModal = () => {
        setCleanupStep('confirm');
        setCleanupConfirmText("");
        setShowCleanupModal(true);
    };

    const handleCleanup = async () => {
        if (!ALLOWED_CLEANUP_DAYS.has(cleanupDays)) {
            toast.error("Choose 7, 14, 21, or 30 days");
            return;
        }
        if (cleanupConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
            toast.error(`Type ${DELETE_CONFIRM_PHRASE} to confirm`);
            return;
        }

        setCleanupStep('deleting');
        setIsCleaning(true);
        try {
            const days = parseInt(cleanupDays, 10);
            const result = await ApiClient.post<{ deleted_count: number; files_purged?: number }>(
                '/admin/jobs/cleanup',
                { days, confirm: DELETE_CONFIRM_PHRASE },
                { timeout: 120_000 }
            );
            if (result.status === 'success') {
                setDeletedCount(result.data?.deleted_count || 0);
                setFilesPurged(result.data?.files_purged || 0);
                setCleanupStep('success');
                toast.success("Cleanup completed successfully");
                void fetchData();
            } else {
                toast.error(result.message || "Cleanup failed");
                setCleanupStep('confirm');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "An error occurred during cleanup");
            setCleanupStep('confirm');
        } finally {
            setIsCleaning(false);
        }
    };

    const handleDownload = (type: string) => {
        const url = `${ApiClient.getBaseUrl()}/admin/jobs/download-all?type=${encodeURIComponent(type)}&days=${EXPORT_DAYS}`;
        window.open(url, '_blank');
    };

    const canConfirmCleanup = cleanupConfirmText.trim().toUpperCase() === DELETE_CONFIRM_PHRASE;

    if (isLoading && !stats) {
        return (
            <div className="flex-1 space-y-4 p-8">
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="h-8 w-64 bg-slate-200 animate-pulse rounded" />
                        <div className="h-4 w-96 bg-slate-100 animate-pulse rounded" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i} className="h-24 bg-slate-50 animate-pulse" />
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="h-96 bg-slate-50 animate-pulse" />
                    <Card className="h-96 bg-slate-50 animate-pulse" />
                </div>
            </div>
        )
    }

    const overview = stats?.overview || {};
    const breakdown = stats?.breakdown || {};

    return (
        <div className="flex-1 space-y-6 pb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Job Control & Verification Management</h2>
                    <p className="text-sm text-[#5a736c] flex items-center gap-2">
                        System health and data management controls.
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded ml-2" suppressHydrationWarning>
                            Last Refreshed: {lastRefreshed.toLocaleTimeString()}
                        </span>
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void fetchData(); }}
                    className="h-8 gap-2 border-slate-200 text-slate-600"
                >
                    <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Emails Verified"
                    value={asCount(overview.processed_emails).toLocaleString()}
                    subvalue={`${asCount(overview.total_emails).toLocaleString()} requested`}
                    icon={ShieldCheck}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    title="Total Jobs"
                    value={overview.total_jobs || 0}
                    subvalue="Across all users"
                    icon={Layers}
                    color="text-[#0f5c52]"
                    bg="bg-[#0f5c52]/10"
                />
                <StatCard
                    title="Processed Today"
                    value={asCount(overview.processed_today).toLocaleString()}
                    subvalue={`${overview.jobs_today || 0} jobs submitted`}
                    icon={Calendar}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <StatCard
                    title="Last 30 Days"
                    value={asCount(overview.processed_30d).toLocaleString()}
                    subvalue={`${overview.jobs_30d || 0} jobs completed`}
                    icon={Clock}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <MiniStat label="Valid" value={breakdown.valid || 0} />
                <MiniStat label="Unknown" value={breakdown.unknown || 0} />
                <MiniStat label="Invalid" value={breakdown.invalid || 0} />
                <MiniStat label="Catch-all" value={breakdown.catch_all || 0} />
                <MiniStat label="Disposable" value={breakdown.disposable || 0} />
            </div>

            {/* Worker Configuration (Full Width) */}
            <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden w-full">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c] flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-[#0f5c52]" /> Worker Configuration
                    </CardTitle>
                    <CardDescription>Adjust how large lists are split, chunked, and processed.</CardDescription>
                </CardHeader>
                <form onSubmit={settingsForm.handleSubmit(onSaveSettings)}>
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                            {/* 50% Left: General & Worker Settings */}
                            <div className="space-y-5">
                                <div className="space-y-1.5">
                                    <Label htmlFor="max_emails" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Max Emails Per Job</Label>
                                    <Input
                                        id="max_emails"
                                        type="number"
                                        min={10}
                                        max={1000000}
                                        className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.max_emails_per_job ? 'border-red-400' : ''}`}
                                        {...settingsForm.register("max_emails_per_job")}
                                    />
                                    {settingsForm.formState.errors.max_emails_per_job && <p className="text-xs text-red-500">{settingsForm.formState.errors.max_emails_per_job.message}</p>}
                                    <p className="text-[11px] text-slate-500 italic">Max emails allowed per single job upload (10–1,000,000).</p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="max_active" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Max Active Jobs Per User</Label>
                                    <Input
                                        id="max_active"
                                        type="number"
                                        min={0}
                                        max={10000}
                                        className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.max_active_jobs_per_user ? 'border-red-400' : ''}`}
                                        {...settingsForm.register("max_active_jobs_per_user")}
                                    />
                                    {settingsForm.formState.errors.max_active_jobs_per_user && <p className="text-xs text-red-500">{settingsForm.formState.errors.max_active_jobs_per_user.message}</p>}
                                    <p className="text-[11px] text-slate-500 italic">Limit concurrent jobs to prevent resource hogging (0 = infinite).</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="prepare_concurrency" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Prepare Concurrency</Label>
                                        <Input
                                            id="prepare_concurrency"
                                            type="number"
                                            min={1}
                                            max={10}
                                            className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.prepare_concurrency ? 'border-red-400' : ''}`}
                                            {...settingsForm.register("prepare_concurrency")}
                                        />
                                        {settingsForm.formState.errors.prepare_concurrency && <p className="text-xs text-red-500">{settingsForm.formState.errors.prepare_concurrency.message}</p>}
                                        <p className="text-[11px] text-slate-500 italic">How many bulk jobs prepare (shuffle/chunk/queue) at once (1–10). Keep low to protect the API.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="worker_concurrency" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Worker Concurrency</Label>
                                        <Input
                                            id="worker_concurrency"
                                            type="number"
                                            min={1}
                                            max={100}
                                            className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.worker_concurrency ? 'border-red-400' : ''}`}
                                            {...settingsForm.register("worker_concurrency")}
                                        />
                                        {settingsForm.formState.errors.worker_concurrency && <p className="text-xs text-red-500">{settingsForm.formState.errors.worker_concurrency.message}</p>}
                                        <p className="text-[11px] text-slate-500 italic">Parallel verify chunks across workers (1–100). Applied via heartbeat (~1 min).</p>
                                    </div>
                                </div>
                            </div>

                            {/* 50% Right: Chunking Strategy */}
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                        <Layers className="h-4 w-4 text-[#0f5c52]" /> Chunking Strategy
                                    </Label>
                                    <p className="text-[11px] text-slate-500">Auto-adjust chunk sizes and timeouts based on uploaded list size.</p>
                                </div>

                                <div className="space-y-3">
                                    {/* Tier 1 */}
                                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                        <div className="text-xs font-semibold text-slate-800">Tier 1 (Small List)</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <Label htmlFor="tier1_max" className="text-[11px] text-slate-500">Max List Size</Label>
                                                <Input
                                                    id="tier1_max"
                                                    type="number"
                                                    className="h-8 text-xs bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier1_max_list")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier1_size" className="text-[11px] text-slate-500">Chunk Size</Label>
                                                <Input
                                                    id="tier1_size"
                                                    type="number"
                                                    className="h-8 text-xs font-semibold text-[#0f5c52] bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier1_size")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier1_timeout" className="text-[11px] text-slate-500">Timeout (Min)</Label>
                                                <Input
                                                    id="tier1_timeout"
                                                    type="number"
                                                    className="h-8 text-xs font-medium text-amber-700 bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier1_timeout")}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tier 2 */}
                                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                        <div className="text-xs font-semibold text-slate-800">Tier 2 (Medium List)</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <Label htmlFor="tier2_max" className="text-[11px] text-slate-500">Max List Size</Label>
                                                <Input
                                                    id="tier2_max"
                                                    type="number"
                                                    className="h-8 text-xs bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier2_max_list")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier2_size" className="text-[11px] text-slate-500">Chunk Size</Label>
                                                <Input
                                                    id="tier2_size"
                                                    type="number"
                                                    className="h-8 text-xs font-semibold text-[#0f5c52] bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier2_size")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier2_timeout" className="text-[11px] text-slate-500">Timeout (Min)</Label>
                                                <Input
                                                    id="tier2_timeout"
                                                    type="number"
                                                    className="h-8 text-xs font-medium text-amber-700 bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier2_timeout")}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tier 3 */}
                                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                        <div className="text-xs font-semibold text-slate-800">Tier 3 (Large List)</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <Label htmlFor="tier3_max" className="text-[11px] text-slate-500">Max List Size</Label>
                                                <Input
                                                    id="tier3_max"
                                                    type="number"
                                                    className="h-8 text-xs bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier3_max_list")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier3_size" className="text-[11px] text-slate-500">Chunk Size</Label>
                                                <Input
                                                    id="tier3_size"
                                                    type="number"
                                                    className="h-8 text-xs font-semibold text-[#0f5c52] bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier3_size")}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="tier3_timeout" className="text-[11px] text-slate-500">Timeout (Min)</Label>
                                                <Input
                                                    id="tier3_timeout"
                                                    type="number"
                                                    className="h-8 text-xs font-medium text-amber-700 bg-white focus-visible:ring-[#0f5c52]/30"
                                                    {...settingsForm.register("chunk_tier3_timeout")}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4 flex justify-end">
                        <Button
                            type="submit"
                            disabled={settingsForm.formState.isSubmitting || isSaved}
                            className={cn(
                                "shadow-md transition-all active:scale-[0.98] h-9 min-w-[200px]",
                                isSaved
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                    : "border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white"
                            )}
                        >
                            {settingsForm.formState.isSubmitting ? (
                                <>
                                    <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : isSaved ? (
                                <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Configuration Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Apply Configuration
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {/* Bottom Row: Job Cleanup Controls & Results Storage (Side by Side) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <Card className="shadow-none border-rose-100 overflow-hidden flex flex-col justify-between">
                    <CardHeader className="bg-rose-50/30 border-b border-rose-100/50">
                        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-rose-500" /> Job Cleanup Controls
                        </CardTitle>
                        <CardDescription>Remove completed/failed jobs and their bulk result files.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 flex flex-col justify-between">
                        <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 mb-6 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-rose-800 leading-relaxed">
                                <strong>Warning:</strong> Permanent for completed/failed jobs older than the window.
                                Pending/processing jobs are skipped. Bulk <code className="font-mono">.ndjson</code> and source files are purged.
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <select
                                    id="cleanup-days"
                                    name="cleanupDays"
                                    value={cleanupDays}
                                    onChange={(e) => setCleanupDays(e.target.value)}
                                    className="w-full h-10 pl-3 pr-10 text-sm bg-white border border-slate-200 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-slate-700 font-medium"
                                >
                                    <option value="7">Older than 7 Days</option>
                                    <option value="14">Older than 14 Days</option>
                                    <option value="21">Older than 21 Days</option>
                                    <option value="30">Older than 30 Days</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                            </div>
                            <Button
                                variant="destructive"
                                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold h-10 px-6 gap-2"
                                onClick={openCleanupModal}
                            >
                                <Trash2 className="h-4 w-4" />
                                Permanently Delete
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-none border-blue-100 overflow-hidden flex flex-col justify-between">
                    <CardHeader className="bg-blue-50/30 border-b border-blue-100/50">
                        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <Database className="h-5 w-5 text-blue-600" /> Results Storage
                        </CardTitle>
                        <CardDescription>Export verification logs from the last {EXPORT_DAYS} days.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4 flex-1 flex flex-col justify-center">
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-800">Single Verification Logs</h4>
                                <p className="text-[11px] text-slate-500">History of individual email checks ({EXPORT_DAYS}d).</p>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownload('single')}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-2"
                            >
                                <Download className="h-4 w-4" /> Download
                            </Button>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#0f5c52]/5 rounded-lg border border-[#0f5c52]/20">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-800">Bulk Verification Logs</h4>
                                <p className="text-[11px] text-slate-500">Bulk verification results ({EXPORT_DAYS}d).</p>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => handleDownload('bulk')}
                                className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white gap-2 h-8"
                            >
                                <Download className="h-4 w-4" /> Export
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {showCleanupModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        <Card className="shadow-none border-rose-100 overflow-hidden">
                            {cleanupStep === 'confirm' && (
                                <>
                                    <CardHeader className="bg-rose-50/50 border-b border-rose-100/50">
                                        <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                            <AlertCircle className="h-5 w-5 text-rose-600" /> Confirm Deletion
                                        </CardTitle>
                                        <CardDescription>
                                            Permanently remove completed/failed jobs older than {cleanupDays} days (all users).
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="pt-6 pb-2 space-y-3">
                                        <p className="text-sm text-slate-600">
                                            Type <span className="font-mono font-bold">{DELETE_CONFIRM_PHRASE}</span> to confirm. This cannot be undone.
                                        </p>
                                        <Input
                                            value={cleanupConfirmText}
                                            onChange={(e) => setCleanupConfirmText(e.target.value)}
                                            placeholder={DELETE_CONFIRM_PHRASE}
                                            className="font-mono text-sm border-red-200 focus-visible:ring-red-300"
                                            autoComplete="off"
                                        />
                                    </CardContent>
                                    <CardFooter className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
                                        <Button variant="outline" onClick={() => setShowCleanupModal(false)} className="px-6 h-9">Cancel</Button>
                                        <Button
                                            onClick={() => { void handleCleanup(); }}
                                            disabled={isCleaning || !canConfirmCleanup}
                                            className="bg-rose-600 hover:bg-rose-700 text-white px-6 h-9 font-bold"
                                        >
                                            {isCleaning ? "Deleting..." : "Yes, Delete"}
                                        </Button>
                                    </CardFooter>
                                </>
                            )}

                            {cleanupStep === 'deleting' && (
                                <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                                    <Loader2 className="h-12 w-12 text-rose-500 animate-spin" />
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold text-slate-900">Deleting Records...</h3>
                                        <p className="text-sm text-slate-500">Removing database rows and bulk result files. This may take a minute.</p>
                                    </div>
                                </CardContent>
                            )}

                            {cleanupStep === 'success' && (
                                <CardContent className="py-10 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                        <CheckCircle2 className="h-6 w-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold text-slate-900">Cleanup Complete</h3>
                                        <p className="text-sm text-slate-600">
                                            Purged <span className="font-semibold text-slate-900">{deletedCount}</span> job(s)
                                            {filesPurged > 0 && <> and <span className="font-semibold text-slate-900">{filesPurged}</span> result file(s)</>}.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => setShowCleanupModal(false)}
                                        className="bg-slate-900 hover:bg-slate-800 text-white px-8 h-9 text-xs font-bold uppercase tracking-wider"
                                    >
                                        OK
                                    </Button>
                                </CardContent>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </div>
    )
}

function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90">
            <CardContent className="p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-slate-900">{value.toLocaleString()}</p>
            </CardContent>
        </Card>
    )
}

function StatCard({ title, value, subvalue, icon: Icon, color, bg }: {
    title: string
    value: string | number
    subvalue: string
    icon: LucideIcon
    color: string
    bg: string
}) {
    return (
        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 hover:shadow-sm transition-shadow duration-300">
            <CardContent className="p-5">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                        <p className="text-2xl font-bold text-slate-900">{value}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{subvalue}</p>
                    </div>
                    <div className={cn("p-2.5 rounded-xl", bg)}>
                        <Icon className={cn("h-5 w-5", color)} />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
