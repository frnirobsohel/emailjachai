"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, Mail, Upload, List, Activity, Zap } from "lucide-react"

export function QuickActions() {
    return (
        <Card className="col-span-1 lg:col-span-3 shadow-sm border-indigo-100 overflow-hidden h-full flex flex-col">
            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50 p-4">
                <CardTitle className="text-lg font-semibold text-slate-900">Quick Actions</CardTitle>
                <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3 flex-1">
                <div className="grid grid-cols-2 gap-3">
                    <Button className="h-auto py-3 flex flex-col items-center justify-center gap-1.5 bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm transition-all hover:-translate-y-0.5" asChild>
                        <Link href="/dashboard/single-verify">
                            <Mail className="h-5 w-5 mb-0.5" />
                            <span className="font-semibold text-xs">Single</span>
                        </Link>
                    </Button>
                    <Button variant="outline" className="h-auto py-3 flex flex-col items-center justify-center gap-1.5 border-slate-200 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all hover:-translate-y-0.5" asChild>
                        <Link href="/dashboard/bulk-upload">
                            <Upload className="h-5 w-5 mb-0.5" />
                            <span className="font-semibold text-xs">Bulk</span>
                        </Link>
                    </Button>
                </div>

                <Button variant="outline" className="w-full justify-between h-10 text-xs font-medium border-slate-200 hover:bg-slate-50 hover:border-indigo-200 group" asChild>
                    <Link href="/dashboard/jobs">
                        <span className="flex items-center text-slate-600 group-hover:text-indigo-600 transition-colors">
                            <List className="mr-2 h-3.5 w-3.5" /> View All Jobs
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                    </Link>
                </Button>

                <div className="mt-auto pt-1">
                    <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden relative group cursor-pointer shadow-md hover:shadow-lg transition-all border border-slate-700">
                        <div className="relative z-10 p-4">
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="p-1 bg-indigo-500/20 rounded-md ring-1 ring-indigo-500/50">
                                    <Zap className="h-3 w-3 text-indigo-400" />
                                </div>
                                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">PRO TIP</p>
                            </div>
                            <p className="text-sm font-semibold mb-1">Connect via API</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed mb-3 max-w-[90%]">
                                Integrate directly into your app with our robust REST API.
                            </p>
                            <div className="flex items-center text-[10px] font-bold gap-1 text-indigo-300 group-hover:text-white group-hover:translate-x-1 transition-all">
                                Get API Keys <ArrowRight className="h-2.5 w-2.5" />
                            </div>
                        </div>
                        <Activity className="absolute -right-5 -bottom-5 h-20 w-20 text-white opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12" />
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <div className="h-16 w-16 rounded-full bg-indigo-500 blur-2xl" />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
