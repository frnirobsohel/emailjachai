import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Job Control",
}

import { fetchServer } from "@/lib/fetch-server"
import { JobControlClient } from "./job-control-client"

type JobStats = {
    overview?: {
        processed_emails?: string | number
        total_emails?: string | number
        total_jobs?: number
        processed_today?: string | number
        jobs_today?: number
        processed_30d?: string | number
        jobs_30d?: number
    }
    breakdown?: {
        valid?: number
        unknown?: number
        invalid?: number
        catch_all?: number
        disposable?: number
    }
}

export default async function JobControlPage() {
    const initialSettings: Record<string, string> = {};
    let initialStats: JobStats | null = null;
    
    try {
        const [settingsRes, statsRes] = await Promise.all([
            fetchServer<Array<{ setting_key: string; setting_value: string }>>('/admin/settings'),
            fetchServer<JobStats>('/admin/jobs/stats')
        ]);

        if (settingsRes.status === 'success' && Array.isArray(settingsRes.data)) {
            settingsRes.data.forEach((s: { setting_key: string; setting_value: string }) => {
                initialSettings[s.setting_key] = s.setting_value;
            });
        }

        if (statsRes.status === 'success') {
            initialStats = statsRes.data ?? null;
        }
    } catch (e) {
        console.error("Failed to fetch job control data:", e);
    }

    return <JobControlClient initialSettings={initialSettings} initialStats={initialStats} />
}
