import { SecurityDashboardClient } from "./_components/security-dashboard-client"
import { fetchServer } from "@/lib/fetch-server"
import type {
    SecurityHydrateData,
    SecurityLog,
    BlockedEntry,
    SecurityPackage,
} from "@/stores/security-store"

export const metadata = {
    title: 'Public Verifier | Admin Dashboard',
    description: 'Manage public verifier security, fraud detection, and packages',
}

type SecurityDashboardStats = NonNullable<SecurityHydrateData['stats']>

export default async function PublicVerifierPage() {
    const initialData: SecurityHydrateData = {
        logs: [],
        blocked: [],
        packages: [],
    }

    try {
        const [dashRes, logsRes, blockRes, pkgRes] = await Promise.all([
            fetchServer<SecurityDashboardStats>('/admin/public-verifier/dashboard'),
            fetchServer<SecurityLog[]>('/admin/public-verifier/verify-logs'),
            fetchServer<BlockedEntry[]>('/admin/public-verifier/blocklist'),
            fetchServer<SecurityPackage[]>('/admin/packages')
        ]);

        if (dashRes.status === 'success' && dashRes.data) initialData.stats = dashRes.data;
        if (logsRes.status === 'success' && logsRes.data) initialData.logs = logsRes.data;
        if (blockRes.status === 'success' && blockRes.data) initialData.blocked = blockRes.data;
        if (pkgRes.status === 'success' && pkgRes.data) initialData.packages = pkgRes.data;
    } catch (e) {
        console.error("Failed to fetch initial security data", e);
    }

    return (
        <SecurityDashboardClient initialData={initialData} />
    )
}
