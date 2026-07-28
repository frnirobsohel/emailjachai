import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Job Details",
}

import { fetchServer } from "@/lib/fetch-server"
import { JobDetailsClient } from "./job-details-client"
import type { JobDetails } from "@/stores/jobs-store"

type JobStatusResponse = {
    job?: JobDetails
} & Partial<JobDetails>

export default async function JobDetailsPage({ params }: { params: { id: string } }) {
    let initialJob: JobDetails | null = null;
    
    // In Next.js 15+, params is a promise, so we await it
    const resolvedParams = await params;
    
    const result = await fetchServer<JobStatusResponse>(`/jobs/status?jobId=${resolvedParams.id}`);
    if (result.status === 'success' && result.data) {
        const payload = result.data;
        initialJob = payload.job ?? (payload.job_id ? payload as JobDetails : null);
    }

    return <JobDetailsClient initialJob={initialJob} />
}
