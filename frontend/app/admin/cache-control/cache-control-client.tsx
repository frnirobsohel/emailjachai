"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

const policiesSchema = z.object({
    b2b_retention: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number"),
    free_valid_retention: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number"),
    free_invalid_retention: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number")
})

const lookupSchema = z.object({
    email: z.string().email("Invalid email address")
})

export function CacheControlClient({ initialStats }: { initialStats: any }) {
    // Stats State
    const [stats, setStats] = useState({
        total_cached: initialStats?.total_cached || 0,
        free_cached: initialStats?.free_cached || 0,
        b2b_cached: initialStats?.b2b_cached || 0,
        hit_ratio: initialStats?.hit_ratio || "0%"
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
    
    // Operations State
    const [lookupResult, setLookupResult] = useState<any>(null)
    const [isSaved, setIsSaved] = useState(false)
    const [isLoadingStats, setIsLoadingStats] = useState(false)
    const [isPurging, setIsPurging] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

    // Delete Confirmation State
    const [confirmDelete, setConfirmDelete] = useState(false)
    const deleteTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Upload State
    const [isUploading, setIsUploading] = useState(false)

    const fetchStats = useCallback(async () => {
        setIsLoadingStats(true)
        try {
            const res = await ApiClient.get<any>('/admin/cache/stats')
            if (res.status === 'success' && res.data) {
                setStats({
                    total_cached: res.data.total_cached || 0,
                    free_cached: res.data.free_cached || 0,
                    b2b_cached: res.data.b2b_cached || 0,
                    hit_ratio: res.data.hit_ratio || "0%"
                })
                if (res.data.policies) {
                    policiesForm.reset({
                        b2b_retention: res.data.policies.b2b_retention || "30",
                        free_valid_retention: res.data.policies.free_valid_retention || "365",
                        free_invalid_retention: res.data.policies.free_invalid_retention || "30"
                    })
                }
                setLastRefreshed(new Date())
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to load cache stats")
        } finally {
            setIsLoadingStats(false)
        }
    }, [policiesForm])

    useEffect(() => {
        setLastRefreshed(new Date())
    }, [])

    const onSavePolicies = async (values: z.infer<typeof policiesSchema>) => {
        setIsSaved(false)
        try {
            const res = await ApiClient.post<any>('/admin/cache/policies', values)
            if (res.status === 'success') {
                setIsSaved(true)
                toast.success("Policies updated successfully")
                setTimeout(() => setIsSaved(false), 2000)
            } else {
                toast.error(res.message || "Failed to update policies")
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to update policies")
        }
    }

    const onLookup = async (values: z.infer<typeof lookupSchema>) => {
        setLookupResult(null)
        setConfirmDelete(false)
        try {
            const res = await ApiClient.post<any>('/admin/cache/lookup', { email: values.email })
            if (res.status === 'success' && res.data?.found) {
                setLookupResult(res.data.data)
                toast.success(`Found cache: ${res.data.data.status}`)
            } else {
                toast.error("No cache found for this email")
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to lookup email")
        }
    }

    const handleDeleteClick = () => {
        if (!lookupResult) return

        if (!confirmDelete) {
            setConfirmDelete(true)
            if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
            deleteTimerRef.current = setTimeout(() => {
                setConfirmDelete(false)
            }, 3000)
            return
        }

        doDeleteCache()
    }

    const doDeleteCache = async () => {
        if (!lookupResult) return
        if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
        setConfirmDelete(false)

        const toastId = toast.loading("Deleting cache...")
        try {
            const res = await ApiClient.delete<any>('/admin/cache/lookup', { data: { email: lookupResult.email } })
            if (res.status === 'success') {
                toast.success(`Cache for ${lookupResult.email} has been deleted`, { id: toastId })
                setLookupResult(null)
                lookupForm.reset()
                fetchStats()
            } else {
                toast.error(res.message || "Failed to delete cache", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to delete cache", { id: toastId })
        }
    }

    const handlePurge = async () => {
        setIsPurging(true)
        const toastId = toast.loading("Purging expired cache...")
        try {
            const res = await ApiClient.post<any>('/admin/cache/purge', {})
            if (res.status === 'success') {
                toast.success(`Purged ${res.data?.deleted_count || 0} expired records`, { id: toastId })
                fetchStats()
            } else {
                toast.error(res.message || "Failed to purge cache", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to purge cache", { id: toastId })
        } finally {
            setIsPurging(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append("file", file)

        setIsUploading(true)
        const toastId = toast.loading("Importing records...")
        try {
            // Using direct fetch to proxy to handle FormData properly
            const res = await fetch('/next-api/proxy/admin/cache/upload', {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (data.status === 'success' || data.success) {
                toast.success(`Successfully imported ${data.data?.inserted_count || 0} records`, { id: toastId })
                fetchStats()
            } else {
                toast.error(data.message || "Failed to import records", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Upload failed", { id: toastId })
        } finally {
            setIsUploading(false)
            if (e.target) e.target.value = ''
        }
    }

    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
        return num.toString()
    }

    return (
        <div className="flex-1 space-y-6 pb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Cache Management Center</h2>
                    <p className="text-slate-500 text-sm flex items-center gap-2">
                        Manage verification cache rules and system resources.
                        {lastRefreshed && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-3 border border-slate-200">
                                Last Refreshed: {lastRefreshed.toLocaleTimeString()}
                            </span>
                        )}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchStats}
                    disabled={isLoadingStats}
                    className="h-8 gap-2 border-slate-200 text-slate-600"
                >
                    <RefreshCcw className={cn("h-3.5 w-3.5", isLoadingStats && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Stats Grid */}
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
                    value={stats.hit_ratio}
                    subvalue="Saved verifications"
                    icon={Zap}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    title="Free Provider Cache"
                    value={formatNumber(stats.free_cached)}
                    subvalue="Gmail, Yahoo, Outlook"
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
                {/* Configuration Section */}
                <div className="space-y-6">
                    <Card className="shadow-lg border-indigo-50 overflow-hidden ring-1 ring-slate-100">
                        <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Settings2 className="h-5 w-5 text-indigo-600" /> Retention Policies
                            </CardTitle>
                            <CardDescription>Configure how long emails are cached before re-verification.</CardDescription>
                        </CardHeader>
                        <form onSubmit={policiesForm.handleSubmit(onSavePolicies)}>
                            <CardContent className="space-y-5 pt-6">
                                
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">B2B / Custom Domains (Days)</Label>
                                    <Input 
                                        type="number" 
                                        className={`h-9 focus-visible:ring-indigo-500 text-sm ${policiesForm.formState.errors.b2b_retention ? 'border-red-400' : ''}`}
                                        {...policiesForm.register("b2b_retention")}
                                    />
                                    {policiesForm.formState.errors.b2b_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.b2b_retention.message}</p>}
                                    <p className="text-[11px] text-slate-500 italic">Valid or Invalid status. Recommended: 30-45 days.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Valid (Days)</Label>
                                        <Input 
                                            type="number" 
                                            className={`h-9 focus-visible:ring-indigo-500 text-sm ${policiesForm.formState.errors.free_valid_retention ? 'border-red-400' : ''}`}
                                            {...policiesForm.register("free_valid_retention")}
                                        />
                                        {policiesForm.formState.errors.free_valid_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.free_valid_retention.message}</p>}
                                        <p className="text-[11px] text-slate-500 italic">Safe to send. Rec: 365+ days.</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Invalid (Days)</Label>
                                        <Input 
                                            type="number" 
                                            className={`h-9 focus-visible:ring-indigo-500 text-sm ${policiesForm.formState.errors.free_invalid_retention ? 'border-red-400' : ''}`}
                                            {...policiesForm.register("free_invalid_retention")}
                                        />
                                        {policiesForm.formState.errors.free_invalid_retention && <p className="text-xs text-red-500">{policiesForm.formState.errors.free_invalid_retention.message}</p>}
                                        <p className="text-[11px] text-slate-500 italic">Undeliverable. Rec: 30 days.</p>
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
                                            : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                    )}
                                >
                                    {policiesForm.formState.isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : isSaved ? (
                                        <>
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            Policies Saved!
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Apply Policies
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>

                {/* Operations Section */}
                <div className="space-y-6">
                    <Card className="shadow-lg border-blue-50 overflow-hidden ring-1 ring-slate-100">
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
                                <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm relative group">
                                    <Button 
                                        onClick={handleDeleteClick}
                                        variant="ghost" 
                                        size="sm" 
                                        className={cn(
                                            "absolute -top-3 -right-3 h-8 rounded-full shadow-sm transition-all",
                                            confirmDelete 
                                                ? "bg-rose-600 text-white hover:bg-rose-700 hover:text-white px-3 w-auto opacity-100" 
                                                : "bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 w-8 px-0 opacity-0 group-hover:opacity-100"
                                        )}
                                        title="Invalidate this cache"
                                    >
                                        <Trash2 className={cn("h-4 w-4", confirmDelete && "mr-1")} />
                                        {confirmDelete && <span className="text-[10px] font-bold uppercase">Confirm Invalidate</span>}
                                    </Button>
                                    <div className="flex justify-between items-center mb-1 pr-6">
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

                    {/* Storage Maintenance */}
                    <Card className="shadow-lg border-amber-50 overflow-hidden ring-1 ring-slate-100">
                        <CardHeader className="bg-amber-50/30 border-b border-amber-100/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-amber-500" /> Storage Maintenance
                            </CardTitle>
                            <CardDescription>Clean up database space by permanently deleting expired cache records.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-amber-800 leading-relaxed">
                                    This will safely remove all cache records that have passed their retention period. It frees up storage space and keeps the database fast.
                                </div>
                            </div>
                            
                            <Button 
                                variant="outline"
                                onClick={handlePurge}
                                disabled={isPurging}
                                className="w-full bg-white hover:bg-amber-50 text-amber-700 border-amber-200 font-semibold h-10 px-6 gap-2"
                            >
                                <Trash2 className={cn("h-4 w-4", isPurging && "animate-bounce")} />
                                {isPurging ? "Purging..." : "Purge Expired Cache"}
                            </Button>
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* Bulk Upload Section */}
            <div className="mt-6">
                <Card className="shadow-lg border-emerald-50 overflow-hidden ring-1 ring-slate-100">
                    <CardHeader className="bg-emerald-50/30 border-b border-emerald-100/50">
                        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <UploadCloud className="h-5 w-5 text-emerald-600" /> Bulk Cache Import
                        </CardTitle>
                        <CardDescription>Upload verified email lists to directly seed the cache database without spending API credits.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <label className="block border-2 border-dashed border-emerald-200 bg-emerald-50/30 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-emerald-50/50 transition-colors cursor-pointer">
                                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                                <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                                    {isUploading ? "Uploading..." : "Click or drag file to this area to upload"}
                                </h3>
                                <p className="text-xs text-slate-500 max-w-[250px] mx-auto">
                                    Upload a .csv file containing verified emails. The system will automatically detect Email, Status, and Score.
                                </p>
                            </label>
                            <div className="flex justify-end gap-3">
                                <Button variant="outline" className="h-9" disabled={isUploading}>Cancel</Button>
                                <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-2" disabled={isUploading}>
                                    <UploadCloud className={cn("h-4 w-4", isUploading && "animate-bounce")} /> 
                                    {isUploading ? "Processing..." : "Import Data"}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function StatCard({ title, value, subvalue, icon: Icon, color, bg }: any) {
    return (
        <Card className="shadow-md border-indigo-50/50 hover:shadow-lg transition-shadow duration-300">
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
