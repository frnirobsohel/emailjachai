import { SecurityDashboardClient } from "./_components/security-dashboard-client"
import { fetchServer } from "@/lib/fetch-server"

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Security Shield | Admin Dashboard',
    description: 'Manage public verifier security, fraud detection, and packages',
}

export default async function SecurityShieldPage() {
    const initialData = {
        stats: null,
        logs: [],
        blocked: [],
        packages: []
    }

    try {
        const [dashRes, logsRes, blockRes, pkgRes] = await Promise.all([
            fetchServer('/admin/security/dashboard'),
            fetchServer('/admin/security/verify-logs'),
            fetchServer('/admin/security/blocklist'),
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
        <div className="p-6">
            <SecurityDashboardClient initialData={initialData} />
        </div>
    )
}
