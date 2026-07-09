"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, ShieldCheck, Activity, Ban, RefreshCcw, Search, Eye, EyeOff, Terminal, Shield } from "lucide-react"
import { useSecurityStore } from "@/stores/security-store"
import { useSecurityWebSocket } from "@/hooks/use-security-web-socket"

export function SecurityDashboardClient({ initialData }: { initialData?: any }) {
    const [activeTab, setActiveTab] = useState<"stream" | "blocklist">("stream")
    
    // Connect Zustand Store
    const store = useSecurityStore()
    
    // Initialize WebSocket Connection
    useSecurityWebSocket()

    // Initialize initial REST data on mount
    useEffect(() => {
        if (store.hasInitialized) {
            store.initialize(true)
        } else if (initialData && (initialData.stats || initialData.logs.length > 0)) {
            store.hydrate(initialData)
        } else {
            store.initialize()
        }
    }, [initialData])

    // Use store state if initialized, otherwise fallback to initialData (to prevent flash)
    const currentStats = store.hasInitialized ? store.stats : (initialData?.stats || store.stats)
    const currentVerificationEnabled = store.hasInitialized ? store.isVerificationEnabled : (initialData?.stats?.verifier_enabled ?? store.isVerificationEnabled)
    const currentDailyLimit = store.hasInitialized ? store.dailyLimit : (initialData?.stats?.daily_limit || store.dailyLimit)
    const currentLogs = store.hasInitialized ? store.logs : (initialData?.logs || store.logs)
    const currentBlocked = store.hasInitialized ? store.blocked : (initialData?.blocked || store.blocked)
    const currentPackages = store.hasInitialized ? store.packages : (initialData?.packages || store.packages)

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Security Shield</h2>
                    <p className="text-sm text-slate-500 mt-1">Manage public verifier security, fraud detection, and frontend packages.</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-slate-700">Public Verifier</span>
                    <Switch 
                        checked={currentVerificationEnabled} 
                        onCheckedChange={(val) => {
                            store.setVerificationEnabled(val)
                            store.handleSettingsUpdate(undefined, val)
                        }} 
                    />
                    <Badge variant={currentVerificationEnabled ? "default" : "destructive"} className="ml-2">
                        {currentVerificationEnabled ? "Active" : "Disabled"}
                    </Badge>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-indigo-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-sm font-medium text-slate-700">Total Verified (24h)</CardTitle>
                        <Activity className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-slate-900">{currentStats.total_verified}</div>
                        <p className="text-xs text-slate-500 mt-1">Across {currentStats.unique_ips} unique IPs</p>
                    </CardContent>
                </Card>
                <Card className="border-indigo-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-sm font-medium text-slate-700">Fraud Attempts Prevented</CardTitle>
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-slate-900">{currentStats.fraud_prevented}</div>
                        <p className="text-xs text-slate-500 mt-1">Cookie & IP cross-checks</p>
                    </CardContent>
                </Card>
                <Card className="border-indigo-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-sm font-medium text-slate-700">Currently Blocked</CardTitle>
                        <Ban className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-slate-900">{currentStats.currently_blocked}</div>
                        <p className="text-xs text-slate-500 mt-1">IPs & Cookies</p>
                    </CardContent>
                </Card>
                <Card className="border-indigo-100 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-sm font-medium text-slate-700">Daily Free Limit</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent className="pt-4 flex items-center gap-2">
                        <select 
                            value={currentDailyLimit}
                            onChange={(e) => {
                                store.setDailyLimit(e.target.value)
                                store.handleSettingsUpdate(e.target.value, undefined)
                            }}
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600"
                        >
                            <option value="5">5 queries / day</option>
                            <option value="10">10 queries / day</option>
                            <option value="15">15 queries / day</option>
                            <option value="20">20 queries / day</option>
                        </select>
                    </CardContent>
                </Card>
            </div>

            {/* Unified Terminal Window (Stream + Blocklist) */}
            <Card className="shadow-xl border-slate-800 overflow-hidden bg-[#0a0c10] ring-1 ring-slate-800">
                {/* Terminal Toolbar */}
                <div className="px-5 py-3 border-b border-slate-800 bg-[#11141a] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="h-3 w-3 rounded-full bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                            <div className="h-3 w-3 rounded-full bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
                            <div className="h-3 w-3 rounded-full bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        </div>
                        <div className="h-4 w-px bg-slate-800 mx-1 hidden md:block" />
                        
                        {/* Tabs */}
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setActiveTab("stream")}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${activeTab === 'stream' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
                            >
                                <Terminal className="h-3.5 w-3.5" />
                                verify_stream.log
                            </button>
                            <button 
                                onClick={() => setActiveTab("blocklist")}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${activeTab === 'blocklist' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}
                            >
                                <Shield className="h-3.5 w-3.5" />
                                blocklist.log
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeTab === 'blocklist' && (
                             <div className="relative group mr-2">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
                                <input
                                    placeholder="Search blocklist..."
                                    className="pl-8 h-8 text-xs bg-[#0a0c10] border border-slate-800 rounded text-slate-300 placeholder:text-slate-600 focus-visible:outline-none focus-visible:border-indigo-500/50 font-mono w-48"
                                />
                            </div>
                        )}
                        <Button variant="outline" size="sm" className="h-8 text-xs bg-transparent border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => store.initialize(true)}>
                            <RefreshCcw className="h-3.5 w-3.5 mr-2" />
                            Force Sync
                        </Button>
                    </div>
                </div>
                
                {/* Headers */}
                {activeTab === 'stream' ? (
                    <div className="grid font-mono text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-6 py-2 border-b border-slate-800/50 bg-[#0a0c10] select-none" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                        <span>Time</span>
                        <span>IP</span>
                        <span>Cookie</span>
                        <span>Browser</span>
                        <span>Email</span>
                        <span className="text-right">Status</span>
                    </div>
                ) : (
                    <div className="grid font-mono text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-6 py-2 border-b border-slate-800/50 bg-[#0a0c10] select-none" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                        <span>Block At</span>
                        <span>IP</span>
                        <span>Type</span>
                        <span>Reason</span>
                        <span className="text-right">Action</span>
                    </div>
                )}

                {/* Content */}
                <div className="divide-y divide-slate-800/30 overflow-y-auto custom-scrollbar bg-[#0a0c10]" style={{ height: "400px" }}>
                    {activeTab === 'stream' ? (
                        currentLogs.map((log: any) => (
                            <div key={log.id} className="grid items-center px-6 py-3 font-mono text-[11px] hover:bg-white/[0.02] transition-colors group relative" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                                <span className="text-slate-500 group-hover:text-slate-400 transition-colors">{new Date(log.created_at).toLocaleTimeString()}</span>
                                <span className="text-slate-300 font-semibold tabular-nums">{log.ip}</span>
                                <span className="text-slate-500 truncate mr-2" title={log.cookie_id}>{log.cookie_id}</span>
                                <span className="text-slate-500 truncate mr-2" title={log.browser}>{log.browser}</span>
                                <span className="text-indigo-400 truncate mr-2">{log.email}</span>
                                <div className={`text-right font-bold ${log.status === 'valid' ? 'text-emerald-400' : log.status === 'blocked' ? 'text-rose-400' : 'text-amber-400'}`}>
                                    {log.status.toUpperCase()}
                                </div>
                            </div>
                        ))
                    ) : (
                        currentBlocked.map((block: any) => (
                            <div key={block.id} className="grid items-center px-6 py-3 font-mono text-[11px] hover:bg-white/[0.02] transition-colors group relative bg-rose-500/[0.02]" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] opacity-100 bg-rose-500" />
                                <span className="text-slate-500">{new Date(block.blocked_at).toLocaleTimeString()}</span>
                                <span className="text-slate-300 font-semibold truncate mr-2" title={block.value}>{block.value}</span>
                                <div>
                                    <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{block.type.toUpperCase()}</span>
                                </div>
                                <span className="text-rose-300/80 truncate mr-2" title={block.reason}>{block.reason}</span>
                                <div className="text-right">
                                    <button onClick={() => store.unblockClient(block.id)} className="text-[10px] text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded px-3 py-1 transition-all focus:outline-none">
                                        UNBLOCK
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer bar */}
                <div className="px-6 py-2 border-t border-slate-800 bg-[#11141a] flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
                     <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeTab === 'stream' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${activeTab === 'stream' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        </span>
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${activeTab === 'stream' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {activeTab === 'stream' ? 'Live Stream Active' : 'Blocklist Monitor'}
                        </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                        {activeTab === 'stream' ? `${currentLogs.length} ENTRIES` : `${currentBlocked.length} BLOCKS RECORDED`}
                    </span>
                </div>
            </Card>

            {/* Package Visibility Manager */}
            <Card className="border-indigo-100 shadow-sm">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Frontend Pricing Packages</CardTitle>
                    <CardDescription>Select which packages should be visible on the public landing page.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        {currentPackages.map((pkg: any) => (
                            <div key={pkg.id} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between hover:border-indigo-200 transition-colors bg-white">
                                <div>
                                    <h4 className="font-medium text-slate-900">{pkg.name}</h4>
                                    <p className="text-sm text-slate-500">{pkg.price}</p>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <Switch 
                                        checked={pkg.is_public ?? true} 
                                        onCheckedChange={() => store.togglePackage(pkg.id)}
                                    />
                                    <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                                        {pkg.is_public ?? true ? <Eye className="h-3 w-3 text-indigo-500" /> : <EyeOff className="h-3 w-3" />}
                                        {pkg.is_public ?? true ? "Visible" : "Hidden"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #475569;
                }
            `}</style>
        </div>
    )
}
