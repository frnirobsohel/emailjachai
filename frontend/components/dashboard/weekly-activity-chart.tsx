"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
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
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => { setIsMounted(true) }, [])

    return (
        <Card className="col-span-1 lg:col-span-4 shadow-sm border-indigo-100 overflow-hidden h-full flex flex-col">
            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                <CardTitle className="text-lg font-semibold text-slate-900">Weekly Activity</CardTitle>
                <CardDescription>Jobs and emails processed over time</CardDescription>
            </CardHeader>
            <CardContent className="pl-0 pt-4 flex-1">
                {isLoading ? (
                    <div className="h-full w-full min-h-[180px] flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                    </div>
                ) : (
                        <div className="h-full w-full min-h-[180px]">
                        {isMounted && (
                            <ResponsiveContainer
                                width="100%"
                                height="100%"
                                minWidth={1}
                                minHeight={1}
                                initialDimension={CHART_INITIAL_DIMENSION}
                            >
                                <BarChart data={data}>
                                    <XAxis
                                        dataKey="name"
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        stroke="#888888"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar
                                        dataKey="emails"
                                        fill="currentColor"
                                        radius={[4, 4, 0, 0]}
                                        className="fill-indigo-500"
                                        barSize={32}
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
