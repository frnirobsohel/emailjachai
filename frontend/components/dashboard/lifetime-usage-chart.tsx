"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Loader2 } from "lucide-react"

type UsagePoint = {
    name: string
    value: number
    color: string
}

type LifetimeUsageChartProps = {
    data: UsagePoint[]
    isLoading?: boolean
}

const CHART_INITIAL_DIMENSION = { width: 320, height: 192 }

export function LifetimeUsageChart({ data, isLoading = false }: LifetimeUsageChartProps) {
    const [isMounted, setIsMounted] = useState(false)

    const total = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data])
    const displayData = data.filter(d => d.value > 0).length > 0 ? data : [{ name: 'Empty', value: 1, color: '#f1f5f9' }]

    useEffect(() => { setIsMounted(true) }, [])

    const formatValue = (val: number) => {
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return val.toString();
    }

    return (
        <Card className="col-span-1 lg:col-span-3 shadow-sm border-indigo-100 overflow-hidden h-full">
            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                <CardTitle className="text-lg font-semibold text-slate-900">Lifetime Usage Statistics</CardTitle>
                <CardDescription>Total verification results breakdown</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 pt-4">
                {isLoading ? (
                    <div className="h-48 w-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                    </div>
                ) : (
                    <>
                        <div className="relative h-48 w-full flex items-center justify-center">
                            {isMounted && (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={1}
                                    minHeight={1}
                                    initialDimension={CHART_INITIAL_DIMENSION}
                                >
                                    <PieChart>
                                        <Pie
                                            data={displayData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {displayData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: any) => [value.toLocaleString(), 'Emails']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                                <span className="text-2xl font-bold text-slate-900">{formatValue(total)}</span>
                                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">Total</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            {data.map((item, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] text-muted-foreground uppercase font-medium">{item.name}</p>
                                        <p className="text-sm font-semibold">
                                            {formatValue(item.value)}
                                            <span className="text-muted-foreground font-normal ml-1">
                                                ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
