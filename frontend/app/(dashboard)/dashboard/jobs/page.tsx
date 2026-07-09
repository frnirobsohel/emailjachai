import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Verification Jobs",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { JobsClient } from "@/features/jobs/components/jobs-client"
import type { Job } from "@/features/jobs/components/jobs-client"

export default async function JobsPage() {
    let initialJobs: Job[] = [];
    let initialTotal = 0;
    
    const result = await fetchServer('/jobs/list?limit=20&offset=0&type=bulk');
    if (result.status === 'success' && result.data) {
        initialJobs = result.data.jobs || [];
        initialTotal = result.data.total || 0;
    }

    return <JobsClient initialJobs={initialJobs} initialTotal={initialTotal} />
}
