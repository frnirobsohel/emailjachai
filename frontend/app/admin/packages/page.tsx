export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { PackagesClient } from "./packages-client"

export default async function PackagesPage() {
    let initialData: any[] = [];
    
    try {
        const result = await fetchServer('/admin/packages');
        if (result.status === 'success' && Array.isArray(result.data)) {
            initialData = result.data;
        }
    } catch (e) {
        console.error("Failed to fetch admin packages:", e);
    }

    return <PackagesClient initialData={initialData} />
}
