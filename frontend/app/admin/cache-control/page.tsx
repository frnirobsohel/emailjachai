"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/common/card"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Label } from "@/components/common/label"
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
    Trash2
} from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

export default function CacheControlPage() {
    // Stats State
    const [stats, setStats] = useState({
        total_cached: 0,
        free_cached: 0,
        b2b_cached: 0,
        hit_ratio: "0%"
    })

    // Policies State
    const [b2bRetention, setB2bRetention] = useState("30")
    const [freeValidRetention, setFreeValidRetention] = useState("365")
    const [freeInvalidRetention, setFreeInvalidRetention] = useState("30")
    
    // Operations State
    const [searchEmail, setSearchEmail] = useState("")
    const [lookupResult, setLookupResult] = useState<any>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const [isLoadingStats, setIsLoadingStats] = useState(false)
    const [isPurging, setIsPurging] = useState(false)
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

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
                    setB2bRetention(res.data.policies.b2b_retention || "30")
                    setFreeValidRetention(res.data.policies.free_valid_retention || "365")
                    setFreeInvalidRetention(res.data.policies.free_invalid_retention || "30")
                }
                setLastRefreshed(new Date())
            }
        } catch (error) {
            alert("Failed to load cache stats")
        } finally {
            setIsLoadingStats(false)
        }
    }, [])

    useEffect(() => {
        fetchStats()
    }, [fetchStats])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const res = await ApiClient.post<any>('/admin/cache/policies', {
                b2b_retention: b2bRetention.toString(),
                free_valid_retention: freeValidRetention.toString(),
                free_invalid_retention: freeInvalidRetention.toString(),
            })
            if (res.status === 'success') {
                setIsSaved(true)
                alert("Policies updated successfully")
                setTimeout(() => setIsSaved(false), 2000)
            } else {
                alert(res.message || "Failed to update policies")
            }
        } catch (error) {
            alert("Failed to update policies")
        } finally {
            setIsSaving(false)
        }
    }

    const handleLookup = async () => {
        if (!searchEmail) return alert("Enter an email to lookup")
        try {
            const res = await ApiClient.post<any>('/admin/cache/lookup', { email: searchEmail })
            if (res.status === 'success' && res.data?.found) {
                setLookupResult(res.data.data)
                alert(`Found cache: ${res.data.data.status}`)
            } else {
                setLookupResult(null)
                alert("No cache found for this email")
            }
        } catch (error) {
            alert("Failed to lookup email")
        }
    }

    const handleDeleteCache = async () => {
        if (!lookupResult) return
        if (!confirm(`Are you sure you want to invalidate cache for ${lookupResult.email}?`)) return
        
        try {
            const res = await ApiClient.delete<any>('/admin/cache/lookup', { data: { email: lookupResult.email } })
            if (res.status === 'success') {
                alert(`Cache for ${lookupResult.email} has been deleted`)
                setLookupResult(null)
                setSearchEmail("")
                fetchStats()
            } else {
                alert("Failed to delete cache")
            }
        } catch (error) {
            alert("Failed to delete cache")
        }
    }

    const handlePurge = async () => {
        setIsPurging(true)
        try {
            const res = await ApiClient.post<any>('/admin/cache/purge', {})
            if (res.status === 'success') {
                alert(`Purged ${res.data?.deleted_count || 0} expired records`)
                fetchStats()
            } else {
                alert("Failed to purge cache")
            }
        } catch (error) {
            alert("Failed to purge cache")
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
        try {
            // Using direct fetch to proxy to handle FormData properly
            const res = await fetch('/next-api/proxy/admin/cache/upload', {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (data.status === 'success' || data.success) {
                alert(`Successfully imported ${data.data?.inserted_count || 0} records`)
                fetchStats()
            } else {
                alert(data.message || "Failed to import records")
            }
        } catch (error) {
            alert("Upload failed")
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
                        <CardContent className="space-y-5 pt-6">
                            
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">B2B / Custom Domains (Days)</Label>
                                <Input 
                                    type="number" 
                                    value={b2bRetention}
                                    onChange={(e) => setB2bRetention(e.target.value)}
                                    className="h-9 focus-visible:ring-indigo-500 text-sm" 
                                />
                                <p className="text-[11px] text-slate-500 italic">Valid or Invalid status. Recommended: 30-45 days.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Valid (Days)</Label>
                                    <Input 
                                        type="number" 
                                        value={freeValidRetention}
                                        onChange={(e) => setFreeValidRetention(e.target.value)}
                                        className="h-9 focus-visible:ring-indigo-500 text-sm" 
                                    />
                                    <p className="text-[11px] text-slate-500 italic">Safe to send. Rec: 365+ days.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Free Invalid (Days)</Label>
                                    <Input 
                                        type="number" 
                                        value={freeInvalidRetention}
                                        onChange={(e) => setFreeInvalidRetention(e.target.value)}
                                        className="h-9 focus-visible:ring-indigo-500 text-sm" 
                                    />
                                    <p className="text-[11px] text-slate-500 italic">Undeliverable. Rec: 30 days.</p>
                                </div>
                            </div>

                        </CardContent>
                        <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-4">
                            <Button
                                onClick={handleSave}
                                disabled={isSaving || isSaved}
                                className={cn(
                                    "shadow-md transition-all active:scale-[0.98] h-9 w-full sm:min-w-[180px]",
                                    isSaved 
                                        ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                )}
                            >
                                {isSaving ? (
                                    <>
                                        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
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
                            <div className="flex gap-3">
                                <div className="flex-1 space-y-1.5">
                                    <Input 
                                        placeholder="Enter email address..." 
                                        value={searchEmail}
                                        onChange={(e) => setSearchEmail(e.target.value)}
                                        className="h-10 text-sm bg-white border-slate-200"
                                    />
                                </div>
                                <Button onClick={handleLookup} className="h-10 bg-blue-600 hover:bg-blue-700 text-white">
                                    Lookup Status
                                </Button>
                            </div>
                            {lookupResult && (
                                <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm relative group">
                                    <Button 
                                        onClick={handleDeleteCache}
                                        variant="ghost" 
                                        size="sm" 
                                        className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Invalidate this cache"
                                    >
                                        <Trash2 className="h-4 w-4" />
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
