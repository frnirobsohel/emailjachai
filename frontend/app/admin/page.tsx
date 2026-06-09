import { fetchServer } from "@/lib/fetch-server"
import { AdminDashboardClient } from "./_components/admin-client"

export default async function AdminDashboardPage() {
    let initialData = null;
    
    try {
        const result = await fetchServer('/admin/dashboard/stats');
        if (result.status === 'success' && result.data) {
            initialData = result.data;
        }
    } catch (e) {
        console.error("Failed to fetch admin stats:", e);
    }

    return <AdminDashboardClient initialData={initialData} />
}
