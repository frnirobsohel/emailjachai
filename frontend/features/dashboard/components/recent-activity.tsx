"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, Clock, FileText, Mail, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboardStore } from "@/stores/dashboard-store"

export function RecentActivity() {
    const recentJobs = useDashboardStore((state) => state.recentJobs)
    const isLoadingStats = useDashboardStore((state) => state.isLoadingStats)

    return (
        <Card className="col-span-1 flex h-full flex-col overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none lg:col-span-4">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60 p-4">
                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Recent Activity</CardTitle>
                <CardDescription className="text-[#5a736c]">Latest verification and jobs</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-0">
                <div className="divide-y divide-[#0b1f1c]/8">
                    {recentJobs.length === 0 && !isLoadingStats ? (
                        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                            <p className="text-sm text-[#6b857c]">No recent activity yet.</p>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button
                                    size="sm"
                                    className="rounded-md border border-[#08352f] bg-[#0f5c52] text-white hover:bg-[#0b4a42]"
                                    asChild
                                >
                                    <Link href="/dashboard/single-verify">
                                        <Mail className="mr-1.5 h-3.5 w-3.5" /> Single Verify
                                    </Link>
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-md border-[#0b1f1c]/15 text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                                    asChild
                                >
                                    <Link href="/dashboard/bulk-upload">
                                        <Upload className="mr-1.5 h-3.5 w-3.5" /> Bulk Upload
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        recentJobs.map((job, i) => (
                            <Link
                                key={job.job_id || i}
                                href={job.job_id ? `/dashboard/jobs/${job.job_id}` : "/dashboard/jobs"}
                                className="group flex items-center justify-between p-3 transition-colors hover:bg-[#0f5c52]/5"
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className={cn(
                                            "flex h-10 w-10 items-center justify-center rounded-md border shadow-sm transition-colors",
                                            job.status === "processing"
                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                : job.status === "completed"
                                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                  : "border-[#0b1f1c]/10 bg-white text-[#4a635c] group-hover:border-[#0f5c52]/30 group-hover:text-[#0f5c52]"
                                        )}
                                    >
                                        {job.status === "processing" ? (
                                            <Clock className="h-5 w-5" />
                                        ) : (
                                            <FileText className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold leading-none text-[#0b1f1c]">
                                            {job.type === "single"
                                                ? "Single Verification"
                                                : job.filename || "Bulk Job"}
                                        </p>
                                        <p className="text-xs font-medium text-[#6b857c]">
                                            #{job.job_id ? job.job_id.substring(0, 8) : "unknown"} •{" "}
                                            {job.total_emails} {job.total_emails === 1 ? "email" : "emails"}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="mb-1 text-[10px] font-medium text-[#8aa099]">{job.created_at}</p>
                                    <div
                                        className={cn(
                                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                            job.status === "processing"
                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                : job.status === "failed"
                                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        )}
                                    >
                                        {job.status}
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
                <div className="mt-auto border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/40 p-3">
                    <Button
                        variant="ghost"
                        className="h-9 w-full text-[#0f5c52] hover:bg-[#0f5c52]/10 hover:text-[#0b4a42]"
                        asChild
                    >
                        <Link href="/dashboard/jobs">
                            View All Activity <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
