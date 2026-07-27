"use client"

import { useHydrated } from "@/hooks/use-hydrated"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { Loader2 } from "lucide-react"

type WeeklyActivityPoint = {
    name: string
    emails: number
    jobs: number
}

const CHART_INITIAL_DIMENSION = { width: 640, height: 220 }

type WeeklyActivityChartProps = {
    data: WeeklyActivityPoint[]
    isLoading?: boolean
}

export function WeeklyActivityChart({ data, isLoading = false }: WeeklyActivityChartProps) {
    const isMounted = useHydrated()

    return (
        <Card className="col-span-1 flex h-full flex-col overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-4">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Weekly Activity</CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Jobs and emails processed over time
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pl-0 pt-4">
                {isLoading ? (
                    <div className="flex h-full min-h-[180px] w-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#8aa099]" />
                    </div>
                ) : (
                    <div className="h-full min-h-[180px] w-full overflow-hidden">
                        {isMounted && (
                            <ResponsiveContainer
                                width="100%"
                                height="100%"
                                minWidth={1}
                                minHeight={1}
                                debounce={300}
                                initialDimension={CHART_INITIAL_DIMENSION}
                            >
                                <BarChart data={data}>
                                    <XAxis
                                        dataKey="name"
                                        stroke="#6b857c"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#6b857c"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "rgba(15,92,82,0.06)" }}
                                        contentStyle={{
                                            borderRadius: "8px",
                                            border: "1px solid rgba(11,31,28,0.1)",
                                            boxShadow: "0 4px 12px rgba(11,31,28,0.08)",
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={36}
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: "12px", paddingBottom: "10px" }}
                                    />
                                    <Bar
                                        name="Emails Verified"
                                        dataKey="emails"
                                        fill="#0f5c52"
                                        radius={[4, 4, 0, 0]}
                                        barSize={16}
                                    />
                                    <Bar
                                        name="Jobs Processed"
                                        dataKey="jobs"
                                        fill="#1a8a78"
                                        radius={[4, 4, 0, 0]}
                                        barSize={16}
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
