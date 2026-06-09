import { fetchServer } from "@/lib/fetch-server"
import { JobDetailsClient } from "./job-details-client"

export default async function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let initialJob = null;
    
    const result = await fetchServer(`/jobs/status?jobId=${id}`);
    if (result.status === 'success' && result.data) {
        // API returns { data: { job: {...}, result: {...} } }
        initialJob = result.data.job || result.data;
    }

    return <JobDetailsClient initialJob={initialJob} />
}
