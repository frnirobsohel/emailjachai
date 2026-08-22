"use client"

import { useState, useCallback, useRef } from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Database,
    RefreshCcw,
    Settings2,
    Search,
    ShieldAlert,
    Zap,
    Clock,
    AlertCircle,
    CheckCircle2,
    Save,
    UploadCloud,
    FileText,
    Trash2,
    Loader2
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"

const retentionDay = z
    .string()
    .min(1, "Required")
    .regex(/^\d+$/, "Must be a number")
    .refine((v) => {
        const n = Number(v)
        return n >= 1 && n <= 3650
    }, "Must be between 1 and 3650 days")

const policiesSchema = z.object({
    b2b_retention: retentionDay,
    free_valid_retention: retentionDay,
    free_invalid_retention: retentionDay,
})

const lookupSchema = z.object({
    email: z.string().email("Invalid email address")
})

type CachePolicies = {
    b2b_retention: string
    free_valid_retention: string
    free_invalid_retention: string
}

type CacheStatsData = {
    total_cached: number
    free_cached: number
    b2b_cached: number
    hit_ratio?: string | null
    policies?: CachePolicies
}

type CacheLookupResult = {
    email: string
    status: string
    score: number | string
    is_free: boolean
    created_at: string
}

type CacheStatsInitial = Partial<CacheStatsData> & {
    policies?: Partial<CachePolicies>
}

export type { CacheStatsInitial }

const DELETE_CONFIRM_PHRASE = "DELETE"

export function CacheControlClient({ initialStats }: { initialStats: CacheStatsInitial | null }) {
    const [stats, setStats] = useState<{
        total_cached: number
        free_cached: number
        b2b_cached: number
        hit_ratio: string | null
    }>({
        total_cached: initialStats?.total_cached || 0,
        free_cached: initialStats?.free_cached || 0,
        b2b_cached: initialStats?.b2b_cached || 0,
        hit_ratio: initialStats?.hit_ratio ?? null,
    })

    const policiesForm = useForm<z.infer<typeof policiesSchema>>({
        resolver: zodResolver(policiesSchema),
        defaultValues: {
            b2b_retention: initialStats?.policies?.b2b_retention || "30",
            free_valid_retention: initialStats?.policies?.free_valid_retention || "365",
            free_invalid_retention: initialStats?.policies?.free_invalid_retention || "30"
        }
    })

    const lookupForm = useForm<z.infer<typeof lookupSchema>>({
        resolver: zodResolver(lookupSchema),
        defaultValues: { email: "" }
    })

    const [lookupResult, setLookupResult] = useState<CacheLookupResult | null>(null)
    const [isSaved, setIsSaved] = useState(false)
    const [isLoadingStats, setIsLoadingStats] = useState(false)
    const [isPurging, setIsPurging] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date())
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [showInvalidateModal, setShowInvalidateModal] = useState(false)
    const [invalidateConfirm, setInvalidateConfirm] = useState("")
    const [showPurgeModal, setShowPurgeModal] = useState(false)
    const [purgeConfirm, setPurgeConfirm] = useState("")
    const [purgeOlderDays, setPurgeOlderDays] = useState("0")
    const [showPurgeOlderModal, setShowPurgeOlderModal] = useState(false)
    const [purgeOlderConfirm, setPurgeOlderConfirm] = useState("")
    const [isPurgingOlder, setIsPurgingOlder] = useState(false)

    const fetchStats = useCallback(async () => {
        setIsLoadingStats(true)
        try {
            const res = await ApiClient.get<CacheStatsData>('/admin/cache/stats')
            if (res.status === 'success' && res.data) {
                setStats({
                    total_cached: res.data.total_cached || 0,
                    free_cached: res.data.free_cached || 0,
                    b2b_cached: res.data.b2b_cached || 0,
                    hit_ratio: res.data.hit_ratio ?? null,
                })
                if (res.data.policies) {
                    policiesForm.reset({
                        b2b_retention: res.data.policies.b2b_retention || "30",
                        free_valid_retention: res.data.policies.free_valid_retention || "365",
                        free_invalid_retention: res.data.policies.free_invalid_retention || "30"
                    })
                }
                setLastRefreshed(new Date())
            } else {
                toast.error(res.message || "Failed to load cache stats")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to load cache stats")
        } finally {
            setIsLoadingStats(false)
        }
    }, [policiesForm])

    const onSavePolicies = async (values: z.infer<typeof policiesSchema>) => {
        setIsSaved(false)
        try {
            const res = await ApiClient.post('/admin/cache/policies', values)
            if (res.status === 'success') {
                setIsSaved(true)
                toast.success("Policies updated successfully")
                setTimeout(() => setIsSaved(false), 2000)
            } else {
                toast.error(res.message || "Failed to update policies")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to update policies")
        }
    }

    const onLookup = async (values: z.infer<typeof lookupSchema>) => {
        setLookupResult(null)
        setShowInvalidateModal(false)
        setInvalidateConfirm("")
        try {
            const res = await ApiClient.post<{ found?: boolean; data?: CacheLookupResult }>('/admin/cache/lookup', { email: values.email })
            if (res.status === 'success' && res.data?.found && res.data.data) {
                setLookupResult(res.data.data)
                toast.success(`Found cache: ${res.data.data.status}`)
            } else {
                toast.error("No cache found for this email")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to lookup email")
        }
    }

    const doDeleteCache = async () => {
        if (!lookupResult) return
        if (invalidateConfirm.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
            toast.error(`Type ${DELETE_CONFIRM_PHRASE} to confirm`)
            return
        }

        const toastId = toast.loading("Deleting cache...")
        try {
            const res = await ApiClient.delete<{ deleted?: boolean }>('/admin/cache/lookup', {
                data: { email: lookupResult.email, confirm: DELETE_CONFIRM_PHRASE },
            })
            if (res.status === 'success') {
                toast.success(`Cache for ${lookupResult.email} has been deleted`, { id: toastId })
                setLookupResult(null)
                lookupForm.reset()
                setShowInvalidateModal(false)
                setInvalidateConfirm("")
                void fetchStats()
            } else {
                toast.error(res.message || "Failed to delete cache", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to delete cache", { id: toastId })
        }
    }

    const handlePurge = async () => {
        if (purgeConfirm.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
            toast.error(`Type ${DELETE_CONFIRM_PHRASE} to confirm`)
            return
        }

        setIsPurging(true)
        const toastId = toast.loading("Purging expired cache...")
        try {
            const res = await ApiClient.post<{ deleted_count?: number }>(
                '/admin/cache/purge',
                { confirm: DELETE_CONFIRM_PHRASE },
                { timeout: 120_000 }
            )
            if (res.status === 'success') {
                toast.success(`Purged ${res.data?.deleted_count || 0} expired records`, { id: toastId })
                setShowPurgeModal(false)
                setPurgeConfirm("")
                void fetchStats()
            } else {
                toast.error(res.message || "Failed to purge cache", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to purge cache", { id: toastId })
        } finally {
            setIsPurging(false)
        }
    }

    const handlePurgeOlder = async () => {
        if (purgeOlderConfirm.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
            toast.error(`Type ${DELETE_CONFIRM_PHRASE} to confirm`)
            return
        }
        if (!/^\d+$/.test(purgeOlderDays.trim())) {
            toast.error("Days must be a number from 0 to 3650")
            return
        }
        const days = Number(purgeOlderDays.trim())
        if (days < 0 || days > 3650) {
            toast.error("Days must be between 0 and 3650 (0 = clear all)")
            return
        }

        setIsPurgingOlder(true)
        const toastId = toast.loading(
            days === 0 ? "Clearing all email cache..." : `Purging cache older than ${days} days...`
        )
        try {
            const res = await ApiClient.post<{ deleted_count?: number; days?: number }>(
                '/admin/cache/purge-older',
                { days, confirm: DELETE_CONFIRM_PHRASE },
                { timeout: 120_000 }
            )
            if (res.status === 'success') {
                const label = days === 0 ? "all cache" : `cache older than ${days} days`
                toast.success(`Purged ${res.data?.deleted_count || 0} records (${label})`, { id: toastId })
                setShowPurgeOlderModal(false)
                setPurgeOlderConfirm("")
                void fetchStats()
            } else {
                toast.error(res.message || "Failed to purge cache by age", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to purge cache by age", { id: toastId })
        } finally {
            setIsPurgingOlder(false)
        }
    }

    const uploadFile = async (file: File) => {
        const lower = file.name.toLowerCase()
        if (!lower.endsWith('.csv') && !lower.endsWith('.txt')) {
            toast.error("Upload a .csv or .txt file")
            return
        }

        const formData = new FormData()
        formData.append("file", file)

        setIsUploading(true)
        const toastId = toast.loading("Importing records...")
        try {
            const res = await fetch('/next-api/proxy/admin/cache/upload', {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (data.status === 'success' || data.success) {
                const inserted = data.data?.inserted_count || 0
                const skipped = data.data?.skipped_count || 0
                toast.success(`Imported ${inserted} records (${skipped} skipped)`, { id: toastId })
                void fetchStats()
            } else {
                toast.error(data.message || "Failed to import records", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Upload failed", { id: toastId })
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) await uploadFile(file)
    }

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) await uploadFile(file)
    }

    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
        return num.toString()
    }

    const hitRatioLabel = stats.hit_ratio && String(stats.hit_ratio).trim() !== ""
        ? String(stats.hit_ratio)
        : "—"

    const canInvalidate = invalidateConfirm.trim().toUpperCase() === DELETE_CONFIRM_PHRASE
    const canPurge = purgeConfirm.trim().toUpperCase() === DELETE_CONFIRM_PHRASE
    const canPurgeOlder = purgeOlderConfirm.trim().toUpperCase() === DELETE_CONFIRM_PHRASE

    return (
        <div className="flex-1 space-y-6 pb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Cache Management Center</h2>
                    <p className="text-sm text-[#5a736c] flex items-center gap-2">
                        Manage verification cache rules and system resources.
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-3 border border-slate-200" suppressHydrationWarning>
                            Last Refreshed: {lastRefreshed.toLocaleTimeString()}
                        </span>
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void fetchStats(); }}
                    disabled={isLoadingStats}
                    className="h-8 gap-2 border-slate-200 text-slate-600"
                >
                    <RefreshCcw className={cn("h-3.5 w-3.5", isLoadingStats && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Cached Emails"
                    value={formatNumber(stats.total_cached)}
                    subvalue="Stored verifications"
                    icon={Database}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard
                    title="Cache Hit Ratio"
                    value={hitRatioLabel}
                    subvalue={hitRatioLabel === "—" ? "Not tracked yet" : "Saved verifications"}
                    icon={Zap}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    title="Free Provider Cache"
                    value={formatNumber(stats.free_cached)}
                    subvalue="Gmail, Yahoo, Outlook…"
                    icon={ShieldAlert}
                    color="text-purple-600"
                    bg="bg-purple-50"
                />
                <StatCard
                    title="B2B Domain Cache"
                    value={formatNumber(stats.b2b_cached)}
                    subvalue="Custom & Corporate"
                    icon={Clock}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden">
                        <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                            <CardTitle className="text-lg font-semibold text-[#0b1f1c] flex items-center gap-2">
                                <Settings2 className="h-5 w-5 text-[#0f5c52]" /> Retention Policies
                            </CardTitle>
                            <CardDescription>Configure how long emails are cached before re-verification (1–3650 days).</CardDescription>
                        </CardHeader>
                        <form onSubmit={policiesForm.handleSubmit(onSavePolicies)}>
                            <CardContent className="space-y-5 pt-6">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">B2B / Custom Domains (Days)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={3650}
                                        className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${policiesForm.formState.errors.b2b_retention ? 'border-red-400' : ''}`}
                                        {...policiesForm.register("b2b_retention")}
                                    />
                                    {policiesForm.formState.errors.b2b_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.b2b_retention.message}</p>}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Valid (Days)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={3650}
                                            className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${policiesForm.formState.errors.free_valid_retention ? 'border-red-400' : ''}`}
                                            {...policiesForm.register("free_valid_retention")}
                                        />
                                        {policiesForm.formState.errors.free_valid_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.free_valid_retention.message}</p>}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Invalid (Days)</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={3650}
                                            className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${policiesForm.formState.errors.free_invalid_retention ? 'border-red-400' : ''}`}
                                            {...policiesForm.register("free_invalid_retention")}
                                        />
                                        {policiesForm.formState.errors.free_invalid_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.free_invalid_retention.message}</p>}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4">
                                <Button
                                    type="submit"
                                    disabled={policiesForm.formState.isSubmitting || isSaved}
                                    className={cn(
                                        "shadow-md transition-all active:scale-[0.98] h-9 w-full sm:min-w-[180px]",
                                        isSaved
                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                            : "border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white"
                                    )}
                                >
                                    {policiesForm.formState.isSubmitting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                    ) : isSaved ? (
                                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Policies Saved!</>
                                    ) : (
                                        <><Save className="mr-2 h-4 w-4" /> Apply Policies</>
                                    )}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="shadow-none border-blue-100 overflow-hidden">
                        <CardHeader className="bg-blue-50/30 border-b border-blue-100/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Search className="h-5 w-5 text-blue-600" /> Lookup & Invalidate
                            </CardTitle>
                            <CardDescription>Find and clear cache for a specific email address.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <form onSubmit={lookupForm.handleSubmit(onLookup)} className="flex gap-3 items-start">
                                <div className="flex-1 space-y-1.5">
                                    <Input
                                        placeholder="Enter email address..."
                                        className={`h-10 text-sm bg-white ${lookupForm.formState.errors.email ? 'border-red-400' : 'border-slate-200'}`}
                                        {...lookupForm.register("email")}
                                    />
                                    {lookupForm.formState.errors.email && <p className="text-xs text-red-500">{lookupForm.formState.errors.email.message}</p>}
                                </div>
                                <Button type="submit" disabled={lookupForm.formState.isSubmitting} className="h-10 bg-blue-600 hover:bg-blue-700 text-white">
                                    {lookupForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Lookup Status
                                </Button>
                            </form>
                            {lookupResult && (
                                <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm relative">
                                    <Button
                                        type="button"
                                        onClick={() => {
                                            setInvalidateConfirm("")
                                            setShowInvalidateModal(true)
                                        }}
                                        variant="ghost"
                                        size="sm"
                                        className="absolute -top-3 -right-3 h-8 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 px-3"
                                        title="Invalidate this cache"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        <span className="text-[10px] font-bold uppercase">Invalidate</span>
                                    </Button>
                                    <div className="flex justify-between items-center mb-1 pr-24">
                                        <span className="font-medium text-slate-700">{lookupResult.email}</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                            lookupResult.status === 'valid' ? "bg-emerald-100 text-emerald-700" :
                                            lookupResult.status === 'catch_all' ? "bg-amber-100 text-amber-700" :
                                            "bg-rose-100 text-rose-700"
                                        )}>{lookupResult.status}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-2 grid grid-cols-2 gap-2">
                                        <div>Score: <span className="font-semibold">{lookupResult.score}</span></div>
                                        <div>Free: <span className="font-semibold">{lookupResult.is_free ? 'Yes' : 'No'}</span></div>
                                        <div>Created: <span className="font-semibold">{new Date(lookupResult.created_at).toLocaleDateString()}</span></div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-none border-amber-100 overflow-hidden">
                        <CardHeader className="bg-amber-50/30 border-b border-amber-100/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-amber-500" /> Storage Maintenance
                            </CardTitle>
                            <CardDescription>Permanently delete cache rows past their retention window, or by age (0 days = all).</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-amber-800 leading-relaxed">
                                    <strong>Purge expired</strong> uses retention policies.
                                    <strong> Purge by age</strong> deletes rows older than N days — use <strong>0</strong> to clear the entire email cache (forces fresh SMTP re-verify).
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setPurgeConfirm("")
                                    setShowPurgeModal(true)
                                }}
                                disabled={isPurging || isPurgingOlder}
                                className="w-full bg-white hover:bg-amber-50 text-amber-700 border-amber-200 font-semibold h-10 px-6 gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Purge Expired Cache
                            </Button>

                            <div className="space-y-2 pt-2 border-t border-amber-100">
                                <Label htmlFor="purge-older-days" className="text-sm font-medium text-slate-700">
                                    Clear cache older than (days)
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="purge-older-days"
                                        type="number"
                                        min={0}
                                        max={3650}
                                        value={purgeOlderDays}
                                        onChange={(e) => setPurgeOlderDays(e.target.value)}
                                        className="h-10 focus-visible:ring-[#0f5c52]/30"
                                        disabled={isPurging || isPurgingOlder}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setPurgeOlderConfirm("")
                                            setShowPurgeOlderModal(true)
                                        }}
                                        disabled={isPurging || isPurgingOlder}
                                        className="shrink-0 bg-white hover:bg-rose-50 text-rose-700 border-rose-200 font-semibold h-10 px-4 gap-2"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Purge by age
                                    </Button>
                                </div>
                                <p className="text-[11px] text-slate-500">0 = delete all cached emails. Requires typing DELETE.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="shadow-none border-emerald-100 overflow-hidden">
                <CardHeader className="bg-emerald-50/30 border-b border-emerald-100/50">
                    <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <UploadCloud className="h-5 w-5 text-emerald-600" /> Bulk Cache Import
                    </CardTitle>
                    <CardDescription>
                        Upload CSV/TXT with Email + Status columns. Unknown statuses are skipped (max 100,000 rows).
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => { void onDrop(e) }}
                            className={cn(
                                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors",
                                isDragging ? "border-emerald-400 bg-emerald-50" : "border-emerald-200 bg-emerald-50/30"
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.txt"
                                className="hidden"
                                onChange={(e) => { void handleFileChange(e) }}
                                disabled={isUploading}
                            />
                            <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                <FileText className="h-6 w-6" />
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900 mb-1">
                                {isUploading ? "Uploading..." : "Drop a file here, or choose one"}
                            </h3>
                            <p className="text-xs text-slate-500 max-w-[280px] mx-auto mb-4">
                                Status must be valid / invalid / catch_all / unknown. Rows without a recognized status are skipped.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9"
                                    disabled={isUploading}
                                    onClick={() => {
                                        if (fileInputRef.current) fileInputRef.current.value = ''
                                    }}
                                >
                                    Clear
                                </Button>
                                <Button
                                    type="button"
                                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                                    disabled={isUploading}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <UploadCloud className={cn("h-4 w-4", isUploading && "animate-bounce")} />
                                    {isUploading ? "Processing..." : "Choose File"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {showInvalidateModal && lookupResult && (
                <ConfirmModal
                    title="Invalidate Cache Entry"
                    description={`Type ${DELETE_CONFIRM_PHRASE} to remove ${lookupResult.email} from cache.`}
                    confirmText={invalidateConfirm}
                    onConfirmTextChange={setInvalidateConfirm}
                    canConfirm={canInvalidate}
                    confirmLabel="Invalidate"
                    onCancel={() => setShowInvalidateModal(false)}
                    onConfirm={() => { void doDeleteCache() }}
                />
            )}

            {showPurgeModal && (
                <ConfirmModal
                    title="Purge Expired Cache"
                    description={`Type ${DELETE_CONFIRM_PHRASE} to permanently delete expired cache rows.`}
                    confirmText={purgeConfirm}
                    onConfirmTextChange={setPurgeConfirm}
                    canConfirm={canPurge && !isPurging}
                    confirmLabel={isPurging ? "Purging..." : "Purge"}
                    onCancel={() => setShowPurgeModal(false)}
                    onConfirm={() => { void handlePurge() }}
                />
            )}

            {showPurgeOlderModal && (
                <ConfirmModal
                    title={Number(purgeOlderDays) === 0 ? "Clear All Email Cache" : `Purge Cache Older Than ${purgeOlderDays} Days`}
                    description={
                        Number(purgeOlderDays) === 0
                            ? `Type ${DELETE_CONFIRM_PHRASE} to delete EVERY cached email result. Next verifies will re-probe SMTP.`
                            : `Type ${DELETE_CONFIRM_PHRASE} to delete cache rows older than ${purgeOlderDays} days.`
                    }
                    confirmText={purgeOlderConfirm}
                    onConfirmTextChange={setPurgeOlderConfirm}
                    canConfirm={canPurgeOlder && !isPurgingOlder}
                    confirmLabel={isPurgingOlder ? "Purging..." : "Purge by age"}
                    onCancel={() => setShowPurgeOlderModal(false)}
                    onConfirm={() => { void handlePurgeOlder() }}
                />
            )}
        </div>
    )
}

function ConfirmModal({
    title,
    description,
    confirmText,
    onConfirmTextChange,
    canConfirm,
    confirmLabel,
    onCancel,
    onConfirm,
}: {
    title: string
    description: string
    confirmText: string
    onConfirmTextChange: (v: string) => void
    canConfirm: boolean
    confirmLabel: string
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <Card className="w-full max-w-md shadow-none border-rose-100 overflow-hidden">
                <CardHeader className="bg-rose-50/50 border-b border-rose-100/50">
                    <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-rose-600" /> {title}
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-3">
                    <Input
                        value={confirmText}
                        onChange={(e) => onConfirmTextChange(e.target.value)}
                        placeholder={DELETE_CONFIRM_PHRASE}
                        className="font-mono text-sm border-red-200 focus-visible:ring-red-300"
                        autoComplete="off"
                    />
                </CardContent>
                <CardFooter className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={onCancel} className="px-6 h-9">Cancel</Button>
                    <Button
                        type="button"
                        disabled={!canConfirm}
                        onClick={onConfirm}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-6 h-9 font-bold"
                    >
                        {confirmLabel}
                    </Button>
                </CardFooter>
            </Card>
        </div>
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
        <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90">
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
