"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CreditCard, Activity, DollarSign, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useAdminStore } from "@/stores/admin-store"
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket"

export function AdminDashboardClient({ initialData }: { initialData: any }) {
    const store = useAdminStore()
    const data = store.data || initialData
    const [isLoading, setIsLoading] = useState(false)

    // Connect to WebSocket to receive real-time admin_stats_update events
    useAdminWebSocket()

    const fetchStats = async () => {
        try {
            const result = await ApiClient.get('/admin/dashboard/stats');
            if (result.status === 'success') {
                store.setData(result.data as any);
            }
        } catch (error) {
            console.error("Failed to fetch admin stats:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        // Initialize store on mount ONLY if not yet initialized
        if (initialData && !store.hasInitialized) {
            store.setData(initialData);
        }
    }, [initialData]);

    useEffect(() => {
        if (store.hasInitialized) {
            fetchStats();
        }
    }, [store.hasInitialized]);


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
                <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
                <button
                    onClick={() => { setIsLoading(true); fetchStats(); }}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    title="Refresh Stats"
                >
                    <RefreshCcw className={`h-5 w-5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className="shadow-sm border-indigo-100 overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 border-b border-indigo-50/50">
                            <CardTitle className="text-sm font-medium text-slate-900">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className="h-4 w-4 text-slate-500" />
                        </CardHeader>
                        <CardContent className="pt-4">
                            {isLoading && !data ? (
                                <div className="h-8 w-24 bg-slate-100 animate-pulse rounded"></div>
                            ) : (
                                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                            )}
                            <div className="flex items-center text-xs mt-1">
                                {stat.trend === 'up' ? (
                                    <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                                ) : (
                                    <ArrowDownRight className="h-3 w-3 text-blue-500 mr-1" />
                                )}
                                <span className={stat.trend === 'up' ? 'text-green-600 font-medium' : 'text-blue-600 font-medium'}>
                                    {stat.description}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-lg font-semibold text-slate-900">Recent Registrations</CardTitle>
                        <CardDescription>Latest users who joined the platform.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            {isLoading && !data ? (
                                [1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="flex items-center justify-between p-2">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse"></div>
                                            <div className="space-y-1">
                                                <div className="h-4 w-24 bg-slate-100 animate-pulse rounded"></div>
                                                <div className="h-3 w-32 bg-slate-100 animate-pulse rounded"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                (data?.recent_users || []).map((user: any) => (
                                    <div key={user.email} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs text-uppercase">
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{user.name}</p>
                                                <p className="text-xs text-slate-500">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-semibold">{user.plan}</p>
                                            <p className="text-[10px] text-slate-400">{user.date}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {(!isLoading && (!data?.recent_users || data.recent_users.length === 0)) && (
                                <p className="text-sm text-slate-500 text-center py-4">No recent registrations found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3 shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="text-lg font-semibold text-slate-900">Security Logs</CardTitle>
                        <CardDescription>Recent administrative and security events.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            {isLoading && !data ? (
                                [1, 2, 3, 4].map((i) => (
                                    <div key={i} className="flex gap-3 pl-4 py-1 relative">
                                        <div className="h-4 w-32 bg-slate-100 animate-pulse rounded"></div>
                                    </div>
                                ))
                            ) : (
                                (data?.recent_logs || []).map((log: any, i: number) => (
                                    <div key={i} className="flex gap-3 border-l-2 border-slate-200 pl-4 py-1 relative">
                                        <div className={`absolute -left-[5px] top-2 h-2 w-2 rounded-full ${log.status === 'success' ? 'bg-green-500' :
                                            log.status === 'warning' ? 'bg-amber-500' :
                                                log.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                                            }`}></div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium">{log.event}</p>
                                            <p className="text-xs text-slate-500">{log.user} • {log.time}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {(!isLoading && (!data?.recent_logs || data.recent_logs.length === 0)) && (
                                <p className="text-sm text-slate-500 text-center py-4">No recent activity logs.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
