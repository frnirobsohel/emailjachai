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

const CHART_INITIAL_DIMENSION = { width: 320, height: 192 }

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
        <Card className="col-span-1 h-full overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-3">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">
                    Lifetime Usage Statistics
                </CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Total verification results breakdown
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0 overflow-hidden pt-4">
                {isLoading ? (
                    <div className="flex h-48 w-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#8aa099]" />
                    </div>
                ) : (
                    <>
                        <div className="relative flex h-48 w-full items-center justify-center overflow-hidden">
                            {isMounted && (
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={1}
                                    minHeight={1}
                                    debounce={300}
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
                                <span className="text-2xl font-semibold text-[#0b1f1c]">
                                    {formatValue(total)}
                                </span>
                                <span className="text-[10px] font-medium uppercase tracking-wider text-[#6b857c]">
                                    Total
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            {data.map((item) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <div
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] font-medium uppercase text-[#6b857c]">
                                            {item.name}
                                        </p>
                                        <p className="text-sm font-semibold text-[#0b1f1c]">
                                            {formatValue(item.value)}
                                            <span className="ml-1 font-normal text-[#6b857c]">
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
