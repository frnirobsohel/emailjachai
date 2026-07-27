import { SecurityDashboardClient } from "./_components/security-dashboard-client"
import { fetchServer } from "@/lib/fetch-server"


export const metadata = {
    title: 'Public Verifier | Admin Dashboard',
    description: 'Manage public verifier security, fraud detection, and packages',
}

export default async function PublicVerifierPage() {
    const initialData = {
        stats: null,
        logs: [],
        blocked: [],
        packages: []
    }

    try {
        const [dashRes, logsRes, blockRes, pkgRes] = await Promise.all([
            fetchServer('/admin/public-verifier/dashboard'),
            fetchServer('/admin/public-verifier/verify-logs'),
            fetchServer('/admin/public-verifier/blocklist'),
            fetchServer('/admin/packages')
        ]);

        if (dashRes.status === 'success') initialData.stats = dashRes.data;
        if (logsRes.status === 'success') initialData.logs = logsRes.data || [];
        if (blockRes.status === 'success') initialData.blocked = blockRes.data || [];
        if (pkgRes.status === 'success') initialData.packages = pkgRes.data || [];
    } catch (e) {
        console.error("Failed to fetch initial security data", e);
    }

    return (
        <SecurityDashboardClient initialData={initialData} />
    )
}
