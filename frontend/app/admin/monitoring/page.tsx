"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Zap, Cpu, MemoryStick as Memory } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { logger } from "@/lib/logger"

interface MetricPoint {
    time: string;
    cpu: number;
    ram: number;
    latency: number;
}

export default function MonitoringPage() {
    const [metrics, setMetrics] = useState<MetricPoint[]>([]);
    const [currentMetrics, setCurrentMetrics] = useState({
        cpu: 0,
        ram: 0,
        latency: 0,
        reqs: 0
    });

    useEffect(() => {
        const handleMetricsUpdate = (event: any) => {
            const { data } = event.detail;
            const newPoint: MetricPoint = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                cpu: data.cpu_load || 0,
                ram: data.ram_usage || 0,
                latency: data.latency_ms || 0
            };

            setMetrics(prev => [...prev.slice(-19), newPoint]); // Keep last 20 points
            setCurrentMetrics({
                cpu: data.cpu_load || 0,
                ram: data.ram_usage || 0,
                latency: data.latency_ms || 0,
                reqs: data.requests_per_sec || 0
            });
        };

        window.addEventListener('ws:worker_update' as any, handleMetricsUpdate);
        window.addEventListener('ws:system_metrics' as any, handleMetricsUpdate);

        return () => {
            window.removeEventListener('ws:worker_update' as any, handleMetricsUpdate);
            window.removeEventListener('ws:system_metrics' as any, handleMetricsUpdate);
        };
    }, []);

    const stats = [
        { title: "Avg Latency", value: `${currentMetrics.latency}ms`, icon: Zap, color: "text-amber-500" },
        { title: "CPU Load", value: `${currentMetrics.cpu}%`, icon: Cpu, color: "text-indigo-500" },
        { title: "Memory", value: `${currentMetrics.ram}%`, icon: Memory, color: "text-green-500" },
        { title: "Active Req", value: `${currentMetrics.reqs}/s`, icon: Activity, color: "text-blue-500" },
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Server Monitoring</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title} className="shadow-sm border-indigo-100">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium text-slate-500 uppercase">{stat.title}</CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="shadow-sm border-indigo-100 overflow-hidden mt-6">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Performance Metrics</CardTitle>
                    <CardDescription>Live visualization of server performance over time.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 overflow-hidden">
                    <div className="h-[350px] w-full overflow-hidden">
                        {metrics.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" debounce={300}>
                                <AreaChart data={metrics}>
                                    <defs>
                                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                        dataKey="time" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                        minTickGap={30}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                    />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="cpu" 
                                        stroke="#6366f1" 
                                        fillOpacity={1} 
                                        fill="url(#colorCpu)" 
                                        strokeWidth={2}
                                        name="CPU %"
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="ram" 
                                        stroke="#10b981" 
                                        fillOpacity={1} 
                                        fill="url(#colorRam)" 
                                        strokeWidth={2}
                                        name="RAM %"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full w-full bg-slate-50 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-200">
                                <div className="text-center space-y-2">
                                    <Activity className="h-10 w-10 text-slate-300 mx-auto animate-pulse" />
                                    <p className="text-sm text-slate-400 font-medium">Awaiting real-time data metrics...</p>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
