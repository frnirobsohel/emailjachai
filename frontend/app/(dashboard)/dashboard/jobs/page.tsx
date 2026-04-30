"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/common/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/card"
import { Upload, RefreshCcw, MoreHorizontal, Eye, Download, Trash2 } from "lucide-react"
import { CreditBadge } from "@/app/(dashboard)/_components/credit-badge"
import Link from "next/link"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/common/dropdown-menu"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"
import { DataTable } from "@/components/reusable/data-table"
import { StatusBadge } from "@/components/reusable/status-badge"

interface Job {
    job_id: string;
    filename: string | null;
    status: "pending" | "processing" | "completed" | "failed";
    total_emails: number;
    processed_count: number;
    created_at: string;
}

export default function JobsPage() {
    const [jobs, setJobs] = useState<Job[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)

    const fetchJobs = async () => {
        try {
            const data = await ApiClient.get('/jobs/list?limit=50&type=bulk');
            if (data.status === 'success') {
                const responseData = data.data as { jobs: Job[] }
                setJobs(responseData.jobs || []);
            }
        } catch (error) {
            logger.error("Failed to fetch jobs:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const handleDeleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) return;
        setIsDeleting(jobId);
        try {
            const data = await ApiClient.post('/jobs/delete', { job_id: jobId });
            if (data.status === 'success') {
                setJobs(prevJobs => prevJobs.filter(job => job.job_id !== jobId));
            } else {
                alert(data.message || 'Failed to delete job');
            }
        } catch (error) {
            logger.error("Failed to delete job technical error:", error);
            alert('An unexpected error occurred while deleting the job.');
        } finally {
            setIsDeleting(null);
        }
    }

    useEffect(() => {
        fetchJobs();
    }, []);

    const columns = [
        { 
            header: "Job ID", 
            accessorKey: "job_id",
            cell: (job: Job) => <span className="font-medium text-slate-700">{job.job_id.substring(0, 12)}...</span>
        },
        { 
            header: "File Name", 
            accessorKey: "filename",
            cell: (job: Job) => <span className="font-medium text-slate-900">{job.filename || 'Bulk Upload'}</span>
        },
        { 
            header: "Status", 
            accessorKey: "status",
            cell: (job: Job) => <StatusBadge status={job.status} />
        },
        { 
            header: "Progress", 
            accessorKey: "progress",
            className: "w-[200px]",
            cell: (job: Job) => {
                const percent = job.total_emails > 0 ? Math.min(100, Math.round((job.processed_count / job.total_emails) * 100)) : 0;
                return (
                    <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                                className={job.status === 'completed' ? "bg-green-500 h-2 rounded-full" : "bg-blue-500 h-2 rounded-full"}
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-500 font-medium w-8 text-right">{percent}%</span>
                    </div>
                );
            }
        },
        { 
            header: "Date", 
            accessorKey: "created_at",
            cell: (job: Job) => <span className="text-slate-500 text-xs">{job.created_at}</span>
        },
        { 
            header: "Actions", 
            accessorKey: "actions",
            className: "text-right",
            cell: (job: Job) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={isDeleting === job.job_id}>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => window.location.href = `/dashboard/jobs/${job.job_id}`}>
                            <Eye className="mr-2 h-4 w-4 text-slate-500" /> Job Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <a href={`/next-api/proxy/jobs/download?jobId=${job.job_id}&format=csv`} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-2 h-4 w-4 text-slate-500" /> Download
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteJob(job.job_id)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Job
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ];

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Email Jobs</h2>
                <div className="flex items-center space-x-4">
                    <CreditBadge />
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={fetchJobs} className="border-indigo-100">
                            <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                        </Button>
                        <Button className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm" asChild>
                            <Link href="/dashboard/bulk-upload">
                                <Upload className="mr-2 h-4 w-4" /> Upload New List
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Job History</CardTitle>
                    <CardDescription>Manage your email verification tasks.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <DataTable columns={columns} data={jobs} isLoading={isLoading} />
                </CardContent>
            </Card>
        </div>
    )
}

