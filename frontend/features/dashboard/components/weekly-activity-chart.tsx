"use client"

import { useHydrated } from "@/hooks/use-hydrated"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import { Loader2 } from "lucide-react"

type WeeklyActivityPoint = {
    name: string
    emails: number
    jobs: number
}

const CHART_INITIAL_DIMENSION = { width: 640, height: 280 }

type WeeklyActivityChartProps = {
    data: WeeklyActivityPoint[]
    isLoading?: boolean
}

export function WeeklyActivityChart({ data, isLoading = false }: WeeklyActivityChartProps) {
    const isMounted = useHydrated()

    return (
        <Card className="col-span-1 flex h-full flex-col overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-4">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Weekly Activity</CardTitle>
                        <CardDescription className="text-[#5a736c]">
                            Jobs and emails processed over time
                        </CardDescription>
                    </div>
                    {/* Legend outside the SVG — prevents overlap/cramp inside the plot */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#5a736c]">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#0f5c52]" />
                            Emails Verified
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#1a8a78]" />
                            Jobs Processed
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col pt-4 pb-2">
                {isLoading ? (
                    <div className="flex min-h-[240px] w-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#8aa099]" />
                    </div>
                ) : (
                    <div className="h-[240px] w-full min-h-[240px] sm:h-[260px]">
                        {isMounted && (
                            <ResponsiveContainer
                                width="100%"
                                height="100%"
                                minWidth={1}
                                minHeight={1}
                                debounce={300}
                                initialDimension={CHART_INITIAL_DIMENSION}
                            >
                                <BarChart
                                    data={data}
                                    margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                                    barCategoryGap="28%"
                                    barGap={6}
                                >
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="rgba(11,31,28,0.08)"
                                        strokeDasharray="3 3"
                                    />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#6b857c"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                    />
                                    <YAxis
                                        stroke="#6b857c"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        width={36}
                                        tickMargin={4}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "rgba(15,92,82,0.06)" }}
                                        contentStyle={{
                                            borderRadius: "8px",
                                            border: "1px solid rgba(11,31,28,0.1)",
                                            boxShadow: "0 4px 12px rgba(11,31,28,0.08)",
                                        }}
                                    />
                                    <Bar
                                        name="Emails Verified"
                                        dataKey="emails"
                                        fill="#0f5c52"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={28}
                                    />
                                    <Bar
                                        name="Jobs Processed"
                                        dataKey="jobs"
                                        fill="#1a8a78"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={28}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
