"use client"

import { useState, useEffect, useCallback } from "react"
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
    BarChart3,
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
    chunk_size: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number"),
    task_timeout: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number"),
    max_emails_per_job: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number"),
    max_active_jobs_per_user: z.string().min(1, "Required").regex(/^\d+$/, "Must be a number")
})

export function JobControlClient({ initialSettings, initialStats }: { initialSettings: Record<string, string>, initialStats: any }) {
    const settingsForm = useForm<z.infer<typeof settingsSchema>>({
        resolver: zodResolver(settingsSchema),
        defaultValues: {
            chunk_size: initialSettings.chunk_size || "1000",
            task_timeout: initialSettings.task_timeout || "60",
            max_emails_per_job: initialSettings.max_emails_per_job || "100000",
            max_active_jobs_per_user: initialSettings.max_active_jobs_per_user || "0"
        }
    })

    const [stats, setStats] = useState<any>(initialStats)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [isCleaning, setIsCleaning] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
    
    // Cleanup Modal State
    const [showCleanupModal, setShowCleanupModal] = useState(false)
    const [cleanupDays, setCleanupDays] = useState("7")
    const [cleanupStep, setCleanupStep] = useState<'confirm' | 'deleting' | 'success'>('confirm')
    const [deletedCount, setDeletedCount] = useState(0)

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [settingsRes, statsRes] = await Promise.all([
                ApiClient.get('/admin/settings'),
                ApiClient.get('/admin/jobs/stats')
            ]);

            if (settingsRes.status === 'success' && Array.isArray(settingsRes.data)) {
                const mappedSettings: Record<string, string> = {};
                settingsRes.data.forEach((s: any) => {
                    mappedSettings[s.setting_key] = s.setting_value;
                });

                settingsForm.reset({
                    chunk_size: mappedSettings.chunk_size || "1000",
                    task_timeout: mappedSettings.task_timeout || "60",
                    max_emails_per_job: mappedSettings.max_emails_per_job || "100000",
                    max_active_jobs_per_user: mappedSettings.max_active_jobs_per_user || "0"
                });
            }

            if (statsRes.status === 'success') {
                setStats(statsRes.data);
            }
            setLastRefreshed(new Date());
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [settingsForm]);

    useEffect(() => {
        if (initialSettings) {
            settingsForm.reset({
                chunk_size: initialSettings.chunk_size || "1000",
                task_timeout: initialSettings.task_timeout || "60",
                max_emails_per_job: initialSettings.max_emails_per_job || "100000",
                max_active_jobs_per_user: initialSettings.max_active_jobs_per_user || "0"
            });
        }
        if (initialStats) {
            setStats(initialStats);
        }
    }, [initialSettings, initialStats, settingsForm]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

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
                fetchData();
            } else {
                toast.error(result.message || "Failed to save settings");
            }
        } catch (error: any) {
            toast.error(error.message || "Error saving settings");
        }
    };

    const handleCleanup = async () => {
        setCleanupStep('deleting');
        setIsCleaning(true);
        try {
            const days = parseInt(cleanupDays);
            const result = await ApiClient.post<{ deleted_count: number }>('/admin/jobs/cleanup', { days });
            if (result.status === 'success') {
                setDeletedCount(result.data?.deleted_count || 0);
                setCleanupStep('success');
                toast.success("Cleanup completed successfully");
                fetchData();
            } else {
                toast.error(result.message || "Cleanup failed");
                setShowCleanupModal(false);
            }
        } catch (error: any) {
            toast.error(error.message || "An error occurred during cleanup");
            setShowCleanupModal(false);
        } finally {
            setIsCleaning(false);
        }
    };

    const handleDownload = (type: string) => {
        const url = `${ApiClient.getBaseUrl()}/admin/jobs/download-all?type=${type}`;
        window.open(url, '_blank');
    };

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
                    onClick={fetchData}
                    className="h-8 gap-2 border-slate-200 text-slate-600"
                >
                    <RefreshCcw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Emails Verified"
                    value={parseInt(overview.processed_emails || "0").toLocaleString()}
                    subvalue={`${parseInt(overview.total_emails || "0").toLocaleString()} requested`}
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
                    value={parseInt(overview.processed_today || "0").toLocaleString()}
                    subvalue={`${overview.jobs_today || 0} jobs submitted`}
                    icon={Calendar}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <StatCard
                    title="Last 30 Days"
                    value={parseInt(overview.processed_30d || "0").toLocaleString()}
                    subvalue={`${overview.jobs_30d || 0} jobs completed`}
                    icon={Clock}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Worker Configuration */}
                <Card className="shadow-none border-[#0b1f1c]/10 bg-white/90 overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="text-lg font-semibold text-[#0b1f1c] flex items-center gap-2">
                            <Settings2 className="h-5 w-5 text-[#0f5c52]" /> Worker Configuration
                        </CardTitle>
                        <CardDescription>Adjust how large lists are split and handled.</CardDescription>
                    </CardHeader>
                    <form onSubmit={settingsForm.handleSubmit(onSaveSettings)}>
                        <CardContent className="space-y-5 pt-6">
                            <div className="space-y-1.5">
                                <Label htmlFor="chunk_size" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Chunk Size</Label>
                                <Input
                                    id="chunk_size"
                                    type="number"
                                    className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.chunk_size ? 'border-red-400' : ''}`}
                                    {...settingsForm.register("chunk_size")}
                                />
                                {settingsForm.formState.errors.chunk_size && <p className="text-xs text-red-500">{settingsForm.formState.errors.chunk_size.message}</p>}
                                <p className="text-[11px] text-slate-500 leading-relaxed italic">Emails per task. Smaller means better distribution, larger means less overhead.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="task_timeout" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Timeout (Min)</Label>
                                    <Input
                                        id="task_timeout"
                                        type="number"
                                        className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.task_timeout ? 'border-red-400' : ''}`}
                                        {...settingsForm.register("task_timeout")}
                                    />
                                    {settingsForm.formState.errors.task_timeout && <p className="text-xs text-red-500">{settingsForm.formState.errors.task_timeout.message}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="max_emails" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Max Per Job</Label>
                                    <Input
                                        id="max_emails"
                                        type="number"
                                        className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.max_emails_per_job ? 'border-red-400' : ''}`}
                                        {...settingsForm.register("max_emails_per_job")}
                                    />
                                    {settingsForm.formState.errors.max_emails_per_job && <p className="text-xs text-red-500">{settingsForm.formState.errors.max_emails_per_job.message}</p>}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="max_active" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Max Active Jobs Per User</Label>
                                <Input
                                    id="max_active"
                                    type="number"
                                    className={`h-9 focus-visible:ring-[#0f5c52]/30 text-sm ${settingsForm.formState.errors.max_active_jobs_per_user ? 'border-red-400' : ''}`}
                                    {...settingsForm.register("max_active_jobs_per_user")}
                                />
                                {settingsForm.formState.errors.max_active_jobs_per_user && <p className="text-xs text-red-500">{settingsForm.formState.errors.max_active_jobs_per_user.message}</p>}
                                <p className="text-[11px] text-slate-500 italic">Limit concurrent jobs to prevent resource hogging (0 = infinite).</p>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4">
                            <Button
                                type="submit"
                                disabled={settingsForm.formState.isSubmitting || isSaved}
                                className={cn(
                                    "shadow-md transition-all active:scale-[0.98] h-9 w-full sm:min-w-[180px]",
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

                <div className="space-y-6">
                    {/* Job Cleanup */}
                    <Card className="shadow-lg border-rose-50 overflow-hidden ring-1 ring-slate-100">
                        <CardHeader className="bg-rose-50/30 border-b border-rose-100/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-rose-500" /> Job Cleanup Controls
                            </CardTitle>
                            <CardDescription>Safely remove old training data and result files.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 mb-6 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-rose-800 leading-relaxed">
                                    <strong>Warning:</strong> Cleanup actions are permanent. Associated result files (`.ndjson`) will also be deleted from the server storage.
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
                                    onClick={() => {
                                        setCleanupStep('confirm');
                                        setShowCleanupModal(true);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Permanently Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cleanup Modal */}
                    {showCleanupModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                                <Card className="shadow-2xl border-rose-100 overflow-hidden">
                                    {cleanupStep === 'confirm' && (
                                        <>
                                            <CardHeader className="bg-rose-50/50 border-b border-rose-100/50">
                                                <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                                    <AlertCircle className="h-5 w-5 text-rose-600" /> Confirm Deletion
                                                </CardTitle>
                                                <CardDescription>This action will permanently remove all records and files older than {cleanupDays} days.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="pt-6 pb-2">
                                                <p className="text-sm text-slate-600 mb-4">
                                                    Are you sure you want to proceed? This cannot be undone and will affect all users' data for this period.
                                                </p>
                                            </CardContent>
                                            <CardFooter className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
                                                <Button variant="outline" onClick={() => setShowCleanupModal(false)} className="px-6 h-9">Cancel</Button>
                                                <Button 
                                                    onClick={handleCleanup}
                                                    disabled={isCleaning}
                                                    className="bg-rose-600 hover:bg-rose-700 text-white px-6 h-9 font-bold"
                                                >
                                                    {isCleaning ? "Deleting..." : "Yes, Delete"}
                                                </Button>
                                            </CardFooter>
                                        </>
                                    )}

                                    {cleanupStep === 'deleting' && (
                                        <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                                            <div className="relative h-16 w-16">
                                                <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                                                <Loader2 className="h-16 w-16 text-rose-500 animate-spin absolute inset-0" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-lg font-bold text-slate-900">Deleting Records...</h3>
                                                <p className="text-sm text-slate-500">Please wait while we safely remove the data.</p>
                                            </div>
                                            <div className="w-full max-w-[240px] h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-rose-500 animate-pulse-width" style={{ width: '60%' }} />
                                            </div>
                                            <style jsx>{`
                                                @keyframes progress {
                                                    0% { width: 0%; }
                                                    50% { width: 70%; }
                                                    100% { width: 95%; }
                                                }
                                                .animate-pulse-width {
                                                    animation: progress 3s infinite ease-in-out;
                                                }
                                            `}</style>
                                        </CardContent>
                                    )}

                                    {cleanupStep === 'success' && (
                                        <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                                            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center border-4 border-emerald-50">
                                                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                                            </div>
                                            <div className="space-y-2">
                                                <h3 className="text-xl font-bold text-slate-900">Cleanup Successful!</h3>
                                                <p className="text-sm text-slate-500">
                                                    Successfully deleted <span className="font-bold text-slate-900">{deletedCount}</span> jobs and their associated files.
                                                </p>
                                            </div>
                                            <Button 
                                                onClick={() => setShowCleanupModal(false)}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px] font-bold"
                                            >
                                                OK
                                            </Button>
                                        </CardContent>
                                    )}
                                </Card>
                            </div>
                        </div>
                    )}

                    {/* Results Storage */}
                    <Card className="shadow-lg border-blue-50 overflow-hidden ring-1 ring-slate-100">
                        <CardHeader className="bg-blue-50/30 border-b border-blue-100/50">
                            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Database className="h-5 w-5 text-blue-600" /> Results Storage
                            </CardTitle>
                            <CardDescription>Centralized access to all verification logs.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-800">Single Verification Logs</h4>
                                    <p className="text-[11px] text-slate-500">History of individual email checks.</p>
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
                                    <p className="text-[11px] text-slate-500">All individual bulk verification results.</p>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleDownload('bulk')}
                                    className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white gap-2 h-8"
                                >
                                    <Download className="h-4 w-4" /> Export All
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function StatCard({ title, value, subvalue, icon: Icon, color, bg }: any) {
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
