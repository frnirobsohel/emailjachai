"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CreditCard, Activity, DollarSign, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useAdminStore, type AdminDashboardStats } from "@/stores/admin-store"
import { useAdminWebSocket } from "@/hooks/use-admin-web-socket"

export function AdminDashboardClient({ initialData }: { initialData: AdminDashboardStats | null }) {
    const store = useAdminStore()
    const data = store.data || initialData
    const [isLoading, setIsLoading] = useState(false)

    // Connect to WebSocket to receive real-time admin_stats_update events
    useAdminWebSocket()

    const fetchStats = async () => {
        try {
            const result = await ApiClient.get('/admin/dashboard/stats');
            if (result.status === 'success') {
                store.setData(result.data as AdminDashboardStats);
            }
        } catch (error) {
            console.error("Failed to fetch admin stats:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        // Seed from SSR, then always refresh so soft-nav / store cannot keep stale totals
        if (initialData && !store.hasInitialized) {
            store.setData(initialData);
        }
        void fetchStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: seed SSR then refresh
    }, []);

    useEffect(() => {
        const onFocus = () => {
            void fetchStats();
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- focus listener should not re-bind on fetchStats change
    }, []);


    const stats = [
        {
            title: "Total Users",
            value: data?.total_users?.value || "0",
            description: data?.total_users?.trend || "0% from last month",
            icon: Users,
            trend: data?.total_users?.status || "up"
        },
        {
            title: "Active Jobs",
            value: data?.active_jobs?.value || "0",
            description: data?.active_jobs?.trend || "0 nodes running",
            icon: Activity,
            trend: data?.active_jobs?.status || "up"
        },
        {
            title: "Total Credits Sold",
            value: data?.total_credits?.value || "0",
            description: data?.total_credits?.trend || "0% from last month",
            icon: CreditCard,
            trend: data?.total_credits?.status || "up"
        },
        {
            title: "Total Revenue",
            value: data?.total_revenue?.value || "$0.00",
            description: data?.total_revenue?.trend || "0% from last month",
            icon: DollarSign,
            trend: data?.total_revenue?.status || "up"
        }
    ]

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Admin Dashboard</h2>
                </div>
                <button
                    onClick={() => { setIsLoading(true); fetchStats(); }}
                    className="p-2 hover:bg-[#0b1f1c]/5 rounded-full transition-colors"
                    title="Refresh Stats"
                >
                    <RefreshCcw className={`h-5 w-5 text-[#5a736c] ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                            <CardTitle className="text-sm font-medium text-[#0b1f1c]">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className="h-4 w-4 text-[#0f5c52]" />
                        </CardHeader>
                        <CardContent className="pt-4">
                            {isLoading && !data ? (
                                <div className="h-8 w-24 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                            ) : (
                                <div className="text-2xl font-semibold tracking-tight text-[#0b1f1c]">{stat.value}</div>
                            )}
                            <div className="flex items-center text-xs mt-1">
                                {stat.trend === 'up' ? (
                                    <ArrowUpRight className="h-3 w-3 text-emerald-500 mr-1" />
                                ) : (
                                    <ArrowDownRight className="h-3 w-3 text-rose-500 mr-1" />
                                )}
                                <span className={stat.trend === 'up' ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                                    {stat.description}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Recent Registrations</CardTitle>
                        <CardDescription className="text-[#5a736c]">Latest users who joined the platform.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            {isLoading && !data ? (
                                [1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="flex items-center justify-between p-2">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-[#0b1f1c]/5 animate-pulse"></div>
                                            <div className="space-y-1">
                                                <div className="h-4 w-24 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                                                <div className="h-3 w-32 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                (data?.recent_users || []).map((user) => (
                                    <div key={user.email} className="flex items-center justify-between p-2 hover:bg-[#f0f4f2]/60 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-[#0f5c52]/10 flex items-center justify-center font-bold text-[#0f5c52] text-xs text-uppercase">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-[#0b1f1c]">{user.name}</p>
                                                <p className="text-xs text-[#5a736c]">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-semibold text-[#0b1f1c]">{user.plan}</p>
                                            <p className="text-[10px] text-[#6b857c]">{user.date}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {(!isLoading && (!data?.recent_users || data.recent_users.length === 0)) && (
                                <p className="text-sm text-[#5a736c] text-center py-4">No recent registrations found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3 border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Security Logs</CardTitle>
                        <CardDescription className="text-[#5a736c]">Recent administrative and security events.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            {isLoading && !data ? (
                                [1, 2, 3, 4].map((i) => (
                                    <div key={i} className="flex gap-3 pl-4 py-1 relative">
                                        <div className="h-4 w-32 bg-[#0b1f1c]/5 animate-pulse rounded"></div>
                                    </div>
                                ))
                            ) : (
                                (data?.recent_logs || []).map((log, i: number) => (
                                    <div key={i} className="flex gap-3 border-l-2 border-[#0b1f1c]/10 pl-4 py-1 relative">
                                        <div className={`absolute -left-[5px] top-2 h-2 w-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' :
                                            log.status === 'warning' ? 'bg-amber-500' :
                                                log.status === 'error' ? 'bg-rose-500' : 'bg-[#0f5c52]'
                                            }`}></div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium text-[#0b1f1c]">{log.event}</p>
                                            <p className="text-xs text-[#5a736c]">{log.user} • {log.time}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {(!isLoading && (!data?.recent_logs || data.recent_logs.length === 0)) && (
                                <p className="text-sm text-[#5a736c] text-center py-4">No recent activity logs.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
