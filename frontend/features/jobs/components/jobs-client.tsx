"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, RefreshCcw, MoreHorizontal, Eye, Download, Trash2 } from "lucide-react"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
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
import { DataTable } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { toast } from "react-hot-toast"

export interface Job {
    job_id: string;
    filename: string | null;
    status: "pending" | "processing" | "completed" | "failed";
    total_emails: number;
    processed_count: number;
    created_at: string;
}

import { useJobsStore } from "@/stores/jobs-store"
import { useJobsWebSocket } from "@/hooks/use-jobs-web-socket"

/**
 * JobsClient Component
 * 
 * Manages the UI state for the job history table.
 * Features include pagination, real-time progress bars, and secure job deletion.
 */
export function JobsClient({ initialJobs, initialTotal }: { initialJobs: Job[], initialTotal: number }) {
    // Selectors only — never subscribe to the whole store (new object every set → #185 loop)
    const storeJobs = useJobsStore((s) => s.jobs)
    const storeTotal = useJobsStore((s) => s.total)
    const setJobs = useJobsStore((s) => s.setJobs)
    // Fall back to server-side initialJobs during hydration render to prevent flickering
    const jobs = storeJobs.length > 0 ? storeJobs : initialJobs
    const total = storeJobs.length > 0 ? storeTotal : initialTotal

    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [isRetrying, setIsRetrying] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [offset, setOffset] = useState(0)
    const limit = 20

    // Connect to WebSocket to receive real-time job_update events
    useJobsWebSocket()

    const fetchJobs = async (silent = true) => {
        // Only show row skeletons when there is nothing on screen yet.
        // Silent refetch (mount/focus/pagination) keeps current rows — same as credit history.
        const currentJobs = useJobsStore.getState().jobs
        const hasVisibleRows = (currentJobs.length > 0 ? currentJobs : initialJobs).length > 0
        if (!silent || !hasVisibleRows) {
            setIsLoading(true)
        }
        try {
            const data = await ApiClient.get(`/jobs/list?limit=${limit}&offset=${offset}&type=bulk`);
            if (data.status === 'success') {
                const responseData = data.data as { jobs: Job[], total: number }
                setJobs(responseData.jobs || [], responseData.total || 0);
            }
        } catch (error) {
            logger.error("Failed to fetch jobs:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const handleDeleteJob = async (jobId: string) => {
        setIsDeleting(jobId);
        const toastId = toast.loading("Deleting job...");
        try {
            const data = await ApiClient.post('/jobs/delete', { job_id: jobId });
            if (data.status === 'success') {
                toast.success("Job deleted successfully", { id: toastId });
                void fetchJobs(true);
                setConfirmDelete(null);
            } else {
                toast.error(data.message || 'Failed to delete job', { id: toastId });
            }
        } catch (error: unknown) {
            logger.error("Failed to delete job technical error:", error);
            toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while deleting the job.', { id: toastId });
        } finally {
            setIsDeleting(null);
        }
    }

    const handleRetryJob = async (jobId: string) => {
        setIsRetrying(jobId);
        const toastId = toast.loading("Queuing retry for job...");
        try {
            const data = await ApiClient.post('/jobs/retry', { job_id: jobId });
            if (data.status === 'success') {
                toast.success("Job retry queued successfully", { id: toastId });
                void fetchJobs(true);
            } else {
                toast.error(data.message || 'Failed to retry job', { id: toastId });
            }
        } catch (error: unknown) {
            logger.error("Failed to retry job technical error:", error);
            toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while retrying the job.', { id: toastId });
        } finally {
            setIsRetrying(null);
        }
    }

    // Sync initial server-fetched jobs to the store on mount
    useEffect(() => {
        setJobs(initialJobs, initialTotal)
        // Mount-only: SSR props are intentionally applied once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Silent refetch on mount / page change — avoid skeleton flash when rows already exist
    useEffect(() => {
        void fetchJobs(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset]);

    useEffect(() => {
        const onFocus = () => {
            void fetchJobs(true);
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset]);

    const columns = [
        { 
            header: "Job ID", 
            accessorKey: "job_id",
            cell: (job: Job) => <span className="font-medium text-[#3d564f]">{job.job_id.substring(0, 12)}...</span>
        },
        { 
            header: "File Name", 
            accessorKey: "filename",
            cell: (job: Job) => <span className="font-medium text-[#0b1f1c]">{job.filename || 'Bulk Upload'}</span>
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
                        <div className="flex-1 bg-[#e4ece9] rounded-full h-2">
                            <div
                                className={job.status === 'completed' ? "bg-emerald-500 h-2 rounded-full" : "bg-[#0f5c52] h-2 rounded-full"}
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                        <span className="text-xs text-[#5a736c] font-medium w-8 text-right">{percent}%</span>
                    </div>
                );
            }
        },
        { 
            header: "Date", 
            accessorKey: "created_at",
            cell: (job: Job) => <span className="text-[#5a736c] text-xs">{job.created_at}</span>
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
                            <Eye className="mr-2 h-4 w-4 text-[#5a736c]" /> Job Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild disabled={job.status !== "completed" && job.status !== "failed"}>
                            {job.status === "completed" || job.status === "failed" ? (
                                <a href={`/next-api/proxy/jobs/download?jobId=${job.job_id}&format=csv`} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4 text-[#5a736c]" /> Download
                                </a>
                            ) : (
                                <span className="flex items-center px-2 py-1.5 text-sm text-[#8aa099] cursor-not-allowed">
                                    <Download className="mr-2 h-4 w-4" /> Download (wait until complete)
                                </span>
                            )}
                        </DropdownMenuItem>
                        {job.status === "failed" && (
                            <DropdownMenuItem onClick={() => handleRetryJob(job.job_id)} disabled={isRetrying === job.job_id}>
                                <RefreshCcw className="mr-2 h-4 w-4 text-amber-600" /> Retry Job
                            </DropdownMenuItem>
                        )}
                        {(job.status === "completed" || job.status === "failed") && (
                            confirmDelete === job.job_id ? (
                                <DropdownMenuItem onClick={() => handleDeleteJob(job.job_id)} className="text-rose-600 bg-rose-50 focus:bg-rose-100 font-bold">
                                    <Trash2 className="mr-2 h-4 w-4 animate-bounce" /> Confirm Delete
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onClick={(e) => {
                                    e.preventDefault();
                                    setConfirmDelete(job.job_id);
                                    setTimeout(() => setConfirmDelete(null), 3000);
                                }} className="text-rose-600">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Job
                                </DropdownMenuItem>
                            )
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ];

    return (
        <div className="flex-1 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Email Jobs</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Track and manage your verification job history.</p>
                </div>
                <div className="flex items-center gap-4">
                    <CreditBadge />
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void fetchJobs(true)} className="border-[#0b1f1c]/10 text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]">
                            <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                        </Button>
                        <Button className="rounded-md border border-[#08352f] bg-[#0f5c52] text-white shadow-none hover:bg-[#0b4a42]" asChild>
                            <Link href="/dashboard/bulk-upload">
                                <Upload className="mr-2 h-4 w-4" /> Upload New List
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Job History</CardTitle>
                    <CardDescription className="text-[#5a736c]">Manage your email verification tasks.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <DataTable columns={columns} data={jobs} isLoading={isLoading} />
                </CardContent>
                {!isLoading && jobs.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                        <p className="text-sm text-[#5a736c]">Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} jobs</p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={offset === 0}
                                onClick={() => setOffset(Math.max(0, offset - limit))}
                                className="border-[#0b1f1c]/10 hover:bg-white text-[#3d564f]"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={offset + limit >= total}
                                onClick={() => setOffset(offset + limit)}
                                className="border-[#0b1f1c]/10 hover:bg-white text-[#3d564f]"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}

