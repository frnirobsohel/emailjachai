"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, Trash2, Loader2, RefreshCcw } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useJobsStore, type JobDetails } from "@/stores/jobs-store"
import { useJobsWebSocket } from "@/hooks/use-jobs-web-socket"
import { toast } from "react-hot-toast"

export function JobDetailsClient({ initialJob }: { initialJob: JobDetails | null }) {
    const params = useParams()
    const router = useRouter()
    const jobId = params.id as string

    const store = useJobsStore()
    const job = store.currentJobDetails || initialJob

    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isRetrying, setIsRetrying] = useState(false)

    const fetchJobDetails = useCallback(async () => {
        try {
            const data = await ApiClient.get(`/jobs/status?jobId=${jobId}`);
            if (data.status === 'success') {
                // API returns { data: { job: {...}, result: {...} } }
                const responseData = data.data as { job?: JobDetails; result?: Record<string, unknown> } | JobDetails;
                const jobData = 'job' in responseData && responseData.job
                    ? responseData.job
                    : (responseData as JobDetails);
                store.setCurrentJobDetails(jobData);
            }
        } catch (error) {
            console.error("Failed to fetch job details:", error);
        } finally {
            setIsLoading(false);
        }
    }, [jobId, store]);

    const handleRetryJob = async () => {
        setIsRetrying(true);
        const toastId = toast.loading("Queuing retry for job...");
        try {
            const data = await ApiClient.post('/jobs/retry', { job_id: jobId });
            if (data.status === 'success') {
                toast.success("Job retry queued successfully", { id: toastId });
                fetchJobDetails(); // Refetch job details to show new status
            } else {
                toast.error(data.message || 'Failed to retry job', { id: toastId });
            }
        } catch (error: unknown) {
            console.error("Failed to retry job:", error);
            toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while retrying the job.', { id: toastId });
        } finally {
            setIsRetrying(false);
        }
    }

    // Connect to WebSocket to receive real-time job_update events
    useJobsWebSocket()

    useEffect(() => {
        // Always fetch fresh details on client-side mount to bypass Next.js Router Cache stales
        void fetchJobDetails()
    }, [fetchJobDetails]);

    const handleDeleteJob = async () => {
        if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
            return;
        }

        setIsDeleting(true);
        try {
            const data = await ApiClient.post('/jobs/delete', { job_id: jobId });

            if (data.status === 'success') {
                router.push('/dashboard/jobs');
            } else {
                alert(data.message || 'Failed to delete job');
                setIsDeleting(false);
            }
        } catch (error) {
            console.error("Failed to delete job:", error);
            alert('An error occurred while deleting the job.');
            setIsDeleting(false);
        }
    }

    if (isLoading && !job) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#0f5c52]" />
            </div>
        )
    }

    if (!job) {
        return (
            <div className="flex-1 p-8 text-center">
                <h2 className="text-xl font-semibold mb-2 text-[#0b1f1c]">Job Not Found</h2>
                <Button
                    onClick={() => router.push('/dashboard/jobs')}
                    className="rounded-md border border-[#08352f] bg-[#0f5c52] text-white shadow-none hover:bg-[#0b4a42]"
                >
                    Back to Jobs
                </Button>
            </div>
        )
    }

    return (
        <div className="flex-1 space-y-5">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/dashboard/jobs')}
                    className="text-[#3d564f] hover:bg-[#f0f4f2]/60 hover:text-[#0b1f1c]"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Job Details</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">ID: {job.job_id}</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#3d564f]">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize text-[#0b1f1c]">{job.status}</div>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#3d564f]">Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#0b1f1c]">{job.total_emails > 0 ? Math.min(100, Math.round((job.processed_count / job.total_emails) * 100)) : 0}%</div>
                        <p className="text-xs text-[#6b857c]">{job.processed_count} / {job.total_emails} processed</p>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#3d564f]">Filename</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold truncate text-[#0b1f1c]" title={job.filename ?? undefined}>{job.filename}</div>
                    </CardContent>
                </Card>
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-[#3d564f]">Created At</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm font-bold text-[#0b1f1c]">{job.created_at}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Actions</CardTitle>
                    <CardDescription className="text-[#5a736c]">Manage this specific batch job.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4 pt-6">
                    <a
                        href={`/next-api/proxy/jobs/download?jobId=${job.job_id}&format=csv`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button className="rounded-md border border-[#08352f] bg-[#0f5c52] text-white shadow-none hover:bg-[#0b4a42]">
                            <Download className="mr-2 h-4 w-4" />
                            Download Results
                        </Button>
                    </a>

                    {job.status === "failed" && (
                        <Button onClick={handleRetryJob} disabled={isRetrying || isDeleting} className="bg-amber-600 hover:bg-amber-700 text-white shadow-none">
                            {isRetrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                            Retry Job
                        </Button>
                    )}

                    <Button variant="destructive" onClick={handleDeleteJob} disabled={isDeleting} className="shadow-none">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Job
                    </Button>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">Verification Breakdown</CardTitle>
                    <CardDescription className="text-[#5a736c]">Canonical status counts for this job.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Valid</p>
                        <p className="text-2xl font-bold text-emerald-800">{Number(job.valid ?? job.deliverable ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-rose-700">Invalid</p>
                        <p className="text-2xl font-bold text-rose-800">{Number(job.invalid ?? job.undeliverable ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Unknown</p>
                        <p className="text-2xl font-bold text-amber-800">{Number(job.unknown ?? job.risky ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-[#0b1f1c]/10 bg-[#f0f4f2]/60 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-[#3d564f]">Catch All</p>
                        <p className="text-2xl font-bold text-[#0b1f1c]">{Number(job.catch_all ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-[#0f5c52]/20 bg-[#0f5c52]/5 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-[#0f5c52]">Disposable</p>
                        <p className="text-2xl font-bold text-[#0b4a42]">{Number(job.disposable ?? 0)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
