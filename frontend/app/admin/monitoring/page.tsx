import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Zap, Cpu, MemoryStick as Memory } from "lucide-react"

export default function MonitoringPage() {
    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Server Monitoring</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[
                    { title: "Avg Latency", value: "42ms", icon: Zap, color: "text-amber-500" },
                    { title: "CPU Load", value: "24%", icon: Cpu, color: "text-indigo-500" },
                    { title: "Memory", value: "68%", icon: Memory, color: "text-green-500" },
                    { title: "Active Req", value: "142/s", icon: Activity, color: "text-blue-500" },
                ].map((stat) => (
                    <Card key={stat.title}>
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
                <CardContent>
                    <div className="h-[300px] w-full bg-slate-50 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-200">
                        <div className="text-center space-y-2">
                            <Activity className="h-10 w-10 text-slate-300 mx-auto" />
                            <p className="text-sm text-slate-400 font-medium">Real-time Chart Loading...</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
