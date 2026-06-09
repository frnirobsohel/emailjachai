"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/common/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/common/card"
import { Input } from "@/components/common/input"
import { 
    Key, Copy, Trash2, Plus, CheckCircle2, AlertTriangle, Loader2, 
    MoreVertical, Eye, RefreshCw, Code, Coins, Activity, ShieldCheck, X, Check, Terminal 
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CreditBadge } from "@/app/(dashboard)/_components/credit-badge"
import { useDashboardStore, DashboardStats } from "@/lib/store/dashboard-store"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/common/table"
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from "@/components/common/dropdown-menu"
import { ApiClient } from "@/lib/api-client"

export interface ApiKey {
    id: number;
    name: string;
    key: string;
    key_masked: string;
    created: string;
    status: string;
    last_used?: string;
}

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKey[] }) {
    const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
    const [isLoading, setIsLoading] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")
    const [justCopied, setJustCopied] = useState<string | number | null>(null)
    const [latestCreatedKey, setLatestCreatedKey] = useState<{ id: number; name: string; api_key: string } | null>(null)
    const { stats: dashboardStats, fetchStats: fetchDashboardStats } = useDashboardStore()

    const activeKeysCount = keys.filter(k => k.status?.toLowerCase() === 'active').length;
    const isLimitReached = activeKeysCount >= 5;

    // Modals states
    const [detailKey, setDetailKey] = useState<ApiKey | null>(null)
    const [rotateConfirmKey, setRotateConfirmKey] = useState<ApiKey | null>(null)
    const [isRotating, setIsRotating] = useState(false)
    const [revokeConfirmKey, setRevokeConfirmKey] = useState<ApiKey | null>(null)
    const [isRevoking, setIsRevoking] = useState(false)

    // Snippet tab
    const [activeTab, setActiveTab] = useState<'curl' | 'js'>('curl')
    const [isMounted, setIsMounted] = useState(false)
    const [baseUrl, setBaseUrl] = useState('http://localhost:8000')

    const fetchKeys = async () => {
        try {
            const data = await ApiClient.get('/user/keys');
            if (data.status === 'success') {
                setKeys(data.data as ApiKey[]);
            }
        } catch (error) {
            console.error("Failed to fetch keys:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined') {
            setBaseUrl(window.location.origin);
        }
        fetchDashboardStats();
    }, [fetchDashboardStats]);

    const handleCreateKey = async () => {
        if (!newKeyName || isCreating) return
        setIsCreating(true)

        try {
            const data = await ApiClient.post('/user/keys/create', { name: newKeyName });

            if (data.status === 'success') {
                const created = data.data as { id: number; name: string; api_key: string } | undefined
                if (created?.api_key) {
                    setLatestCreatedKey(created)
                }
                setNewKeyName("");
                fetchKeys();
                fetchDashboardStats(true); // force refetch
            }
        } catch (error) {
            console.error("Failed to create key:", error);
        } finally {
            setIsCreating(false)
        }
    }

    const handleRotateKey = async (id: number) => {
        if (isRotating) return
        setIsRotating(true)

        try {
            const data = await ApiClient.post(`/user/keys/rotate`, { id });
            if (data.status === 'success') {
                const rotated = data.data as { api_key: string; key_masked: string } | undefined
                if (rotated?.api_key) {
                    setLatestCreatedKey({
                        id,
                        name: rotateConfirmKey?.name || "Rotated Key",
                        api_key: rotated.api_key
                    })
                }
                setRotateConfirmKey(null)
                fetchKeys();
            }
        } catch (error) {
            console.error("Failed to rotate key:", error);
        } finally {
            setIsRotating(false)
        }
    }

    const handleRevokeKey = async (id: number) => {
        if (isRevoking) return
        setIsRevoking(true)

        try {
            const data = await ApiClient.post('/user/keys/revoke', { id });
            if (data.status === 'success') {
                setRevokeConfirmKey(null)
                fetchKeys();
                fetchDashboardStats(true); // force refetch
            }
        } catch (error) {
            console.error("Failed to revoke key:", error);
        } finally {
            setIsRevoking(false)
        }
    }

    const copyToClipboard = async (id: string | number, text?: string) => {
        if (!text) {
            alert("For security, existing API keys cannot be viewed again. Copy the key right after creating it.")
            return
        }

        navigator.clipboard.writeText(text);
        setJustCopied(id);
        setTimeout(() => setJustCopied(null), 2000);
    }

    const renderStatusBadge = (status: string) => {
        const s = status ? status.toLowerCase() : 'active';
        if (s === 'active') {
            return (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Active
                </span>
            )
        } else if (s === 'expired') {
            return (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    Expired
                </span>
            )
        } else {
            return (
                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
                    Revoked
                </span>
            )
        }
    }

    return (
        <div className="flex-1 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">API Keys</h2>
                <CreditBadge />
            </div>

            {/* Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                            Active Keys
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-indigo-50">
                            <Key className="h-4 w-4 text-indigo-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {activeKeysCount} / 5
                        </div>
                        <div className="flex items-center text-xs text-slate-400 mt-1">
                            Key allocation limit
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                            API Verifications
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-blue-50">
                            <ShieldCheck className="h-4 w-4 text-blue-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">
                            {dashboardStats?.lifetime_verifications ? Number(dashboardStats.lifetime_verifications).toLocaleString() : "0"}
                        </div>
                        <div className="flex items-center text-xs text-slate-400 mt-1">
                            Total API hits lifetime
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">
                            Service Status
                        </CardTitle>
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-50">
                            <Activity className="h-4 w-4 text-emerald-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                            Operational
                        </div>
                        <div className="flex items-center text-xs text-slate-400 mt-1">
                            Response latency ~248ms
                        </div>
                    </CardContent>
                </Card>
            </div>

             {/* Setup Options */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="flex flex-col border-indigo-100 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle>Create New Key</CardTitle>
                        <CardDescription>Generate a new API key to access our services programmatically.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Key Name</label>
                            <Input
                                placeholder={isLimitReached ? "Active key limit reached (max 5)" : "e.g. My Website API"}
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                disabled={isCreating || isLimitReached}
                                className="border-indigo-100 focus:border-indigo-300 focus:ring focus:ring-indigo-100 focus:ring-opacity-50"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                        <Button
                            className="w-full bg-[#0f172b] hover:bg-[#1e293b] text-white py-2 rounded-xl transition-all"
                            onClick={handleCreateKey}
                            disabled={!newKeyName || isCreating || isLimitReached}
                        >
                            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            {isLimitReached ? "Active Key Limit Reached (Max 5)" : "Generate API Key"}
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="bg-amber-50/60 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-900/30 flex flex-col justify-between shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center text-amber-800 dark:text-amber-200 text-lg font-bold">
                            <AlertTriangle className="mr-2 h-5 w-5 text-amber-600" />
                            Security Warning
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed">
                        Never share your API keys or expose them in client-side code (browsers). Use them only on your server. If a key is compromised, delete/revoke it immediately and generate a new one. All calls consume credits automatically.
                    </CardContent>
                    <CardFooter className="text-xs text-amber-600/80 font-medium">
                        Need help? View our integration docs for detailed instructions.
                    </CardFooter>
                </Card>
            </div>

            {/* Display Rotated/Created Key Modal (Action Needed Alert) */}
            {latestCreatedKey && (
                <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm border-l-4 border-l-emerald-500 transition-all duration-300">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <CardTitle className="text-base text-emerald-900 font-bold">API Key Generated / Rotated Successfully</CardTitle>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 rounded-full hover:bg-emerald-100 text-emerald-700"
                                onClick={() => setLatestCreatedKey(null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <CardDescription className="text-emerald-800/80 mt-1">
                            This is the **only time** the full key will be shown. Please copy and store it securely.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                        <code className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-mono text-slate-800 break-all border border-emerald-100 select-all shadow-inner">
                            {latestCreatedKey.api_key}
                        </code>
                        <Button
                            variant="outline"
                            onClick={() => copyToClipboard('newkey', latestCreatedKey.api_key)}
                            className="border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 rounded-xl"
                        >
                            {justCopied === 'newkey' ? (
                                <>
                                    <Check className="mr-2 h-4 w-4 text-emerald-600" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy Key
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* API Keys Table */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Your API Keys</CardTitle>
                    <CardDescription>Manage your existing keys, verify usage stats, and configure settings.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-100">
                                <TableHead className="py-3.5">Name</TableHead>
                                <TableHead className="py-3.5">API Key</TableHead>
                                <TableHead className="py-3.5">Last Used</TableHead>
                                <TableHead className="py-3.5">Status</TableHead>
                                <TableHead className="py-3.5">Created</TableHead>
                                <TableHead className="text-right py-3.5">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                        <Loader2 className="h-7 w-7 animate-spin mx-auto text-slate-400" />
                                        <p className="text-xs text-slate-500 mt-2">Loading credentials...</p>
                                    </TableCell>
                                </TableRow>
                            ) : keys.map((key) => (
                                <TableRow key={key.id} className="border-b border-slate-50">
                                    <TableCell className="font-medium text-slate-900 py-3">{key.name}</TableCell>
                                    <TableCell className="py-3">
                                        <code className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-600">
                                            {key.key_masked}
                                        </code>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 py-3 font-medium">
                                        {key.last_used || "Never"}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        {renderStatusBadge(key.status)}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500 py-3">{key.created}</TableCell>
                                    <TableCell className="text-right py-3 pr-4">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-8 w-8 p-0 rounded-full hover:bg-slate-100 text-slate-600 focus:ring-0 focus:ring-offset-0"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 shadow-md rounded-xl p-1 z-50">
                                                <DropdownMenuItem 
                                                    onClick={() => setDetailKey(key)}
                                                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg cursor-pointer outline-none"
                                                >
                                                    <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                                    View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    onClick={() => setRotateConfirmKey(key)}
                                                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50/60 hover:text-indigo-700 rounded-lg cursor-pointer outline-none"
                                                >
                                                    <RefreshCw className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                                    Rotate Key
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="my-1 border-t border-slate-100" />
                                                <DropdownMenuItem 
                                                    onClick={() => setRevokeConfirmKey(key)}
                                                    className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg cursor-pointer outline-none"
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                    Revoke Key
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {keys.length === 0 && !isLoading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-slate-500 text-sm">
                                        No API keys found. Create one to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* VIEW DETAILS MODAL */}
            {detailKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between bg-slate-50/80 px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                    <Eye className="h-4.5 w-4.5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-base">{detailKey.name}</h3>
                                    <p className="text-[11px] text-slate-500 font-medium">API Key Details & Statistics</p>
                                </div>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 rounded-full hover:bg-slate-200 text-slate-500"
                                onClick={() => setDetailKey(null)}
                            >
                                <X className="h-4.5 w-4.5" />
                            </Button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
                            {/* Key Value */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Key Token</span>
                                <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                                    <code className="text-xs font-mono text-slate-700">{detailKey.key_masked}</code>
                                    <span className="text-xs font-semibold text-slate-400 uppercase">Masked</span>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-xl border border-slate-100 p-3 space-y-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                                    <div className="pt-1">{renderStatusBadge(detailKey.status)}</div>
                                </div>
                                <div className="rounded-xl border border-slate-100 p-3 space-y-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</span>
                                    <p className="text-sm font-semibold text-slate-700 pt-0.5">{detailKey.created}</p>
                                </div>
                            </div>

                            {/* Statistics section */}
                            <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5">Usage Statistics (Simulated)</h4>
                                <div className="space-y-2.5">
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                                            <Coins className="h-4 w-4 text-amber-500" />
                                            Credits Used
                                        </div>
                                        <span className="font-bold text-slate-800">{(detailKey.id * 184 + 12).toLocaleString()} Credits</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                            Single Verifications
                                        </div>
                                        <span className="font-bold text-slate-800">{(detailKey.id * 128 + 8).toLocaleString()} Emails</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                                            <Terminal className="h-4 w-4 text-blue-500" />
                                            Bulk Upload Jobs
                                        </div>
                                        <span className="font-bold text-slate-800">{(detailKey.id * 3)} Jobs</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                                            <Activity className="h-4 w-4 text-indigo-500" />
                                            Last Active Time
                                        </div>
                                        <span className="font-semibold text-slate-800 text-xs">{detailKey.last_used || "Never"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="bg-slate-50/80 px-6 py-4 flex justify-end border-t border-slate-100">
                            <Button 
                                variant="outline" 
                                className="border-slate-200 bg-white hover:bg-slate-100 rounded-xl"
                                onClick={() => setDetailKey(null)}
                            >
                                Close View
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* INTEGRATION CODE SNIPPET CARD */}
            <Card id="integration-snippets" className="shadow-sm border-indigo-100 overflow-hidden mt-6 transition-all duration-300">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg font-semibold text-slate-900">API Integration Code Snippets</CardTitle>
                            <CardDescription>Integrate our verification services into your applications.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-100 pb-3 gap-2">
                        <Button 
                            variant={activeTab === 'curl' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('curl')}
                            className={cn(
                                "rounded-lg text-xs font-semibold px-3 py-1.5 h-8",
                                activeTab === 'curl' 
                                    ? "bg-[#0f172b] hover:bg-[#1e293b] text-white shadow-sm" 
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            )}
                        >
                            cURL Command
                        </Button>
                        <Button 
                            variant={activeTab === 'js' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab('js')}
                            className={cn(
                                "rounded-lg text-xs font-semibold px-3 py-1.5 h-8",
                                activeTab === 'js' 
                                    ? "bg-[#0f172b] hover:bg-[#1e293b] text-white shadow-sm" 
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                            )}
                        >
                            JavaScript Fetch
                        </Button>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                        Use the code below in your backend server applications. Remember to replace the placeholder token with your actual private API key.
                    </p>

                    <div className="relative">
                        {isMounted && (
                            <>
                                {activeTab === 'curl' ? (
                                    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] font-mono leading-relaxed overflow-x-auto shadow-inner h-32">
{`curl -X POST "${baseUrl}/api/v1/jobs/verify-single" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com"}'`}
                                    </pre>
                                ) : (
                                    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-[11px] font-mono leading-relaxed overflow-x-auto shadow-inner h-32">
{`fetch("${baseUrl}/api/v1/jobs/verify-single", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: "user@example.com"
  })
})
.then(res => res.json())
.then(data => console.log(data));`}
                                    </pre>
                                )}
                            </>
                        )}
                        <Button
                            size="sm"
                            onClick={() => copyToClipboard('snippet', activeTab === 'curl' 
                                ? `curl -X POST "${baseUrl}/api/v1/jobs/verify-single" -H "Authorization: Bearer YOUR_API_KEY" -H "Content-Type: application/json" -d '{"email": "user@example.com"}'`
                                : `fetch("${baseUrl}/api/v1/jobs/verify-single", { method: "POST", headers: { "Authorization": "Bearer YOUR_API_KEY", "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com" }) }).then(res => res.json()).then(data => console.log(data));`
                            )}
                            className="absolute right-3 top-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg py-1 px-2.5 h-7 text-xs font-semibold"
                        >
                            {justCopied === 'snippet' ? (
                                <>
                                    <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Copy Code
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ROTATE CONFIRMATION MODAL */}
            {rotateConfirmKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <RefreshCw className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Rotate API Key?</h3>
                                <p className="text-xs text-slate-500 font-semibold">Action is irreversible</p>
                            </div>
                        </div>

                        <div className="text-sm text-slate-600 leading-relaxed">
                            Rotating the key **&quot;{rotateConfirmKey.name}&quot;** will immediately revoke its active credential token and generate a new one. Any current apps utilizing this token will fail until updated.
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setRotateConfirmKey(null)}
                                disabled={isRotating}
                                className="flex-1 border-slate-200 bg-white hover:bg-slate-100 rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => handleRotateKey(rotateConfirmKey.id)}
                                disabled={isRotating}
                                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold"
                            >
                                {isRotating ? "Rotating..." : "Rotate Token"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* REVOKE CONFIRMATION MODAL */}
            {revokeConfirmKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Revoke API Key?</h3>
                                <p className="text-xs text-red-500 font-bold uppercase tracking-wider">Destructive action</p>
                            </div>
                        </div>

                        <div className="text-sm text-slate-600 leading-relaxed">
                            Are you absolutely sure you want to revoke and delete **&quot;{revokeConfirmKey.name}&quot;**? Applications using this API key will stop working immediately. This cannot be undone.
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setRevokeConfirmKey(null)}
                                disabled={isRevoking}
                                className="flex-1 border-slate-200 bg-white hover:bg-slate-100 rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => handleRevokeKey(revokeConfirmKey.id)}
                                disabled={isRevoking}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
                            >
                                {isRevoking ? "Revoking..." : "Revoke Key"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

