"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock, Mail, Zap, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { ApiClient } from "@/lib/api-client"

export function RecentActivity() {
    const [jobs, setJobs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const fetchRecentJobs = async () => {
        try {
            const result = await ApiClient.get('/jobs/list?limit=4', true);
            if (result.status === 'success' && result.data) {
                const data = result.data as any;
                setJobs(data.jobs || []);
            }
        } catch (error) {
            // Silently fail as ApiClient already logged the error/warning
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchRecentJobs();
    }, []);

    return (
        <Card className="col-span-1 lg:col-span-4 shadow-sm border-indigo-100 overflow-hidden h-full flex flex-col">
            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50 p-4">
                <CardTitle className="text-lg font-semibold text-slate-900">Recent Activity</CardTitle>
                <CardDescription>Latest verification and jobs</CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1">
                <div className="divide-y divide-slate-100">
                    {jobs.length === 0 && !isLoading ? (
                        <div className="p-6 text-center text-slate-400 text-sm italic">
                            No recent activity found.
                        </div>
                    ) : (
                        jobs.map((job, i) => (
                            <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm transition-colors",
                                        job.status === 'processing' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                                            job.status === 'completed' ? 'bg-green-50 border-green-100 text-green-600' :
                                                'bg-white border-slate-100 text-slate-600 group-hover:border-indigo-100 group-hover:text-indigo-600'
                                    )}>
                                        {job.status === 'processing' ? <Clock className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-slate-900 leading-none">{job.filename || 'Bulk Job'}</p>
                                        <p className="text-xs text-slate-500 font-medium">#{job.job_id.substring(0, 8)} • {job.total_emails} emails</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-medium text-slate-400 mb-1">{job.created_at}</p>
                                    <div className={cn(
                                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border",
                                        job.status === 'processing' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                            job.status === 'failed' ? 'bg-red-50 text-red-600 border-red-100' :
                                                'bg-green-50 text-green-600 border-green-100'
                                    )}>
                                        {job.status}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="p-3 border-t border-indigo-50/50 bg-slate-50/30 mt-auto">
                    <Button variant="ghost" className="w-full text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-9" asChild>
                        <Link href="/dashboard/jobs">
                            View All Activity <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
