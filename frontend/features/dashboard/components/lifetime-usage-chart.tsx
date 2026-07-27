"use client"

import { useMemo } from "react"
import { useHydrated } from "@/hooks/use-hydrated"
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

const CHART_INITIAL_DIMENSION = { width: 220, height: 220 }

export function LifetimeUsageChart({ data, isLoading = false }: LifetimeUsageChartProps) {
    const isMounted = useHydrated()

    const total = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data])
    const displayData =
        data.filter((d) => d.value > 0).length > 0
            ? data
            : [{ name: "Empty", value: 1, color: "#e4ece9" }]

    const formatValue = (val: number) => {
        if (val >= 1000) return (val / 1000).toFixed(1) + "K"
        return val.toString()
    }

    return (
        <Card className="col-span-1 flex h-full flex-col overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-3">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">
                    Lifetime Usage Statistics
                </CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Total verification results breakdown
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center pt-5 pb-5">
                {isLoading ? (
                    <div className="flex min-h-[220px] w-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#8aa099]" />
                    </div>
                ) : (
                    // Side-by-side donut + legend — avoids cramped legend under a squeezed pie
                    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-5">
                        <div className="relative h-[180px] w-[180px] shrink-0 sm:h-[200px] sm:w-[200px]">
                            {isMounted && (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={1}
                                    minHeight={1}
                                    debounce={300}
                                    initialDimension={CHART_INITIAL_DIMENSION}
                                >
                                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Pie
                                            data={displayData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius="58%"
                                            outerRadius="82%"
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {displayData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value) => [
                                                Number(value ?? 0).toLocaleString(),
                                                "Emails",
                                            ]}
                                            contentStyle={{
                                                borderRadius: "8px",
                                                border: "1px solid rgba(11,31,28,0.1)",
                                                boxShadow: "0 4px 12px rgba(11,31,28,0.08)",
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-2xl font-semibold tabular-nums text-[#0b1f1c]">
                                    {formatValue(total)}
                                </span>
                                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6b857c]">
                                    Total
                                </span>
                            </div>
                        </div>

                        <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-3 sm:flex-1 sm:grid-cols-1 sm:gap-y-2.5">
                            {data.map((item) => {
                                const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0"
                                return (
                                    <li key={item.name} className="flex min-w-0 items-start gap-2.5">
                                        <span
                                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: item.color }}
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-medium text-[#5a736c]">
                                                {item.name}
                                            </p>
                                            <p className="text-sm font-semibold tabular-nums text-[#0b1f1c]">
                                                {formatValue(item.value)}
                                                <span className="ml-1.5 text-xs font-normal text-[#6b857c]">
                                                    {pct}%
                                                </span>
                                            </p>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
