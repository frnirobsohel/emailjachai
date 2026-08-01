import { SecurityDashboardClient } from "./_components/security-dashboard-client"
import { fetchServer } from "@/lib/fetch-server"
import type {
    SecurityHydrateData,
    SecurityLog,
    BlockedEntry,
} from "@/stores/security-store"

export const metadata = {
    title: 'Public Verifier | Admin Dashboard',
    description: 'Manage public verifier security and fraud detection',
}

type SecurityDashboardStats = NonNullable<SecurityHydrateData['stats']>

export default async function PublicVerifierPage() {
    const initialData: SecurityHydrateData = {
        logs: [],
        blocked: [],
    }

    try {
        const [dashRes, logsRes, blockRes] = await Promise.all([
            fetchServer<SecurityDashboardStats>('/admin/public-verifier/dashboard'),
            fetchServer<SecurityLog[]>('/admin/public-verifier/verify-logs'),
            fetchServer<BlockedEntry[]>('/admin/public-verifier/blocklist'),
        ]);

        if (dashRes.status === 'success' && dashRes.data) initialData.stats = dashRes.data;
        if (logsRes.status === 'success' && logsRes.data) initialData.logs = logsRes.data;
        if (blockRes.status === 'success' && blockRes.data) initialData.blocked = blockRes.data;
    } catch (e) {
        console.error("Failed to fetch initial security data", e);
    }

    return (
        <SecurityDashboardClient initialData={initialData} />
    )
}
