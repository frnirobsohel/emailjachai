export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { JobControlClient } from "./job-control-client"

export default async function JobControlPage() {
    let initialSettings: Record<string, string> = {};
    let initialStats = null;
    
    try {
        const [settingsRes, statsRes] = await Promise.all([
            fetchServer('/admin/settings'),
            fetchServer('/admin/jobs/stats')
        ]);

        if (settingsRes.status === 'success' && Array.isArray(settingsRes.data)) {
            settingsRes.data.forEach((s: any) => {
                initialSettings[s.setting_key] = s.setting_value;
            });
        }

        if (statsRes.status === 'success') {
            initialStats = statsRes.data;
        }
    } catch (e) {
        console.error("Failed to fetch job control data:", e);
    }

    return <JobControlClient initialSettings={initialSettings} initialStats={initialStats} />
}
