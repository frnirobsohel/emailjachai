"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, Trash2, Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useJobsStore } from "@/stores/jobs-store"
import { useJobsWebSocket } from "@/hooks/useJobsWebSocket"

export function JobDetailsClient({ initialJob }: { initialJob: any }) {
    const params = useParams()
    const router = useRouter()
    const jobId = params.id as string

    const store = useJobsStore()
    const job = store.currentJobDetails || initialJob

    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Connect to WebSocket to receive real-time job_update events
    useJobsWebSocket()

    const fetchJobDetails = async () => {
        try {
            const data = await ApiClient.get(`/jobs/status?jobId=${jobId}`);
            if (data.status === 'success') {
                // API returns { data: { job: {...}, result: {...} } }
                const responseData = data.data as { job: any; result: any };
                store.setCurrentJobDetails(responseData.job || responseData);
            }
        } catch (error) {
            console.error("Failed to fetch job details:", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        // Always fetch fresh details on client-side mount to bypass Next.js Router Cache stales
        fetchJobDetails()
    }, [jobId]);

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
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    if (!job) {
        return (
            <div className="flex-1 p-8 text-center">
                <h2 className="text-xl font-semibold mb-2">Job Not Found</h2>
                <Button onClick={() => router.push('/dashboard/jobs')}>Back to Jobs</Button>
            </div>
        )
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center space-x-4 mb-6">
                <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/jobs')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Job Details</h2>
                    <p className="text-sm text-slate-500">ID: {job.job_id}</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize">{job.status}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{job.total_emails > 0 ? Math.min(100, Math.round((job.processed_count / job.total_emails) * 100)) : 0}%</div>
                        <p className="text-xs text-muted-foreground">{job.processed_count} / {job.total_emails} processed</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Filename</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold truncate" title={job.filename}>{job.filename}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Created At</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm font-bold">{job.created_at}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                    <CardDescription>Manage this specific batch job.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4">
                    <a
                        href={`/next-api/proxy/jobs/download?jobId=${job.job_id}&format=csv`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <Download className="mr-2 h-4 w-4" />
                            Download Results
                        </Button>
                    </a>

                    <Button variant="destructive" onClick={handleDeleteJob} disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Job
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Verification Breakdown</CardTitle>
                    <CardDescription>Canonical status counts for this job.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-md border border-green-200 bg-green-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-green-700">Valid</p>
                        <p className="text-2xl font-bold text-green-800">{Number(job.valid ?? job.deliverable ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-red-200 bg-red-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-red-700">Invalid</p>
                        <p className="text-2xl font-bold text-red-800">{Number(job.invalid ?? job.undeliverable ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Unknown</p>
                        <p className="text-2xl font-bold text-amber-800">{Number(job.unknown ?? job.risky ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-700">Catch All</p>
                        <p className="text-2xl font-bold text-slate-800">{Number(job.catch_all ?? 0)}</p>
                    </div>
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Disposable</p>
                        <p className="text-2xl font-bold text-blue-800">{Number(job.disposable ?? 0)}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
