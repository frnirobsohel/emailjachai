import { fetchServer } from "@/lib/fetch-server"
import { JobDetailsClient } from "./job-details-client"

export default async function JobDetailsPage({ params }: { params: { id: string } }) {
    let initialJob = null;
    
    // In Next.js 15+, params is a promise, so we await it
    const resolvedParams = await params;
    
    const result = await fetchServer(`/jobs/status?jobId=${resolvedParams.id}`);
    if (result.status === 'success' && result.data) {
        // API returns { data: { job: {...}, result: {...} } }
        initialJob = result.data.job || result.data;
    }

    return <JobDetailsClient initialJob={initialJob} />
}
