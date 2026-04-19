"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, RefreshCcw, MoreHorizontal, Eye, Download, Trash2 } from "lucide-react"
import { CreditBadge } from "@/components/dashboard/credit-badge"
import Link from "next/link"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"

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
            const data = await ApiClient.get('/jobs/list?limit=50');

            if (data.status === 'success') {
                const responseData = data.data as { jobs: Job[] }
                setJobs(responseData.jobs || []);
            }
        } catch (error) {
            // Unexpected technical failure
            logger.error("Failed to fetch jobs:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const handleDeleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
            return;
        }

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
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchJobs();
            }
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Email Jobs</h2>
                <div className="flex items-center space-x-4">
                    <CreditBadge />
                    <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={fetchJobs} className="border-indigo-100">
                            <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button className="bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm" asChild>
                            <Link href="/dashboard/bulk-upload">
                                <Upload className="mr-2 h-4 w-4" />
                                Upload New List
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="text-lg font-semibold text-slate-900">Job History</CardTitle>
                    <CardDescription>
                        Manage your email verification tasks and view their status.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                <TableHead className="w-[100px]">Job ID</TableHead>
                                <TableHead>File Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[200px]">Progress</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {jobs.map((job) => (
                                <TableRow key={job.job_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <TableCell className="font-medium text-slate-700">{job.job_id.substring(0, 12)}...</TableCell>
                                    <TableCell className="font-medium text-slate-900">{job.filename || 'Bulk Upload'}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className={
                                            job.status === 'completed' ? 'bg-green-100 text-green-700 hover:bg-green-100 ring-1 ring-inset ring-green-600/20 shadow-none font-medium text-xs capitalize' :
                                                job.status === 'processing' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 ring-1 ring-inset ring-amber-600/20 shadow-none font-medium text-xs capitalize' :
                                                    'bg-blue-100 text-blue-700 hover:bg-blue-100 ring-1 ring-inset ring-blue-600/20 shadow-none font-medium text-xs capitalize'
                                        }>
                                            {job.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                                                <div
                                                    className={
                                                        job.status === 'completed' ? "bg-green-500 h-2 rounded-full" :
                                                            job.status === 'processing' ? "bg-amber-500 h-2 rounded-full" :
                                                                "bg-blue-500 h-2 rounded-full"
                                                    }
                                                    style={{ width: `${job.total_emails > 0 ? Math.min(100, (job.processed_count / job.total_emails) * 100) : 0}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-slate-500 font-medium w-12 text-right">
                                                {job.total_emails > 0 ? Math.min(100, Math.round((job.processed_count / job.total_emails) * 100)) : 0}%
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-xs">{job.created_at}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0" disabled={isDeleting === job.job_id}>
                                                    <span className="sr-only">Open menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => window.location.href = `/dashboard/jobs/${job.job_id}`}>
                                                    <Eye className="mr-2 h-4 w-4 text-slate-500" />
                                                    Job Details
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem asChild>
                                                    <a
                                                        href={`/next-api/proxy/jobs/download?jobId=${job.job_id}&format=csv`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="cursor-pointer"
                                                    >
                                                        <Download className="mr-2 h-4 w-4 text-slate-500" />
                                                        Download Results
                                                    </a>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => handleDeleteJob(job.job_id)}
                                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Delete Job
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <div className="flex items-center justify-between p-4 border-t border-indigo-50 bg-slate-50/50">
                    <p className="text-sm text-slate-500">Showing {jobs.length} of {jobs.length} jobs</p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled className="border-indigo-100 hover:bg-white text-slate-600">Previous</Button>
                        <Button variant="outline" size="sm" disabled className="border-indigo-100 hover:bg-white text-slate-600">Next</Button>
                    </div>
                </div>
            </Card>
        </div>
    )
}
