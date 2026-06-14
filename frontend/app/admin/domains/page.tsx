export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { DomainsClient, DomainsResponse } from "./domains-client"

export default async function DomainsPage() {
    let initialData: DomainsResponse | null = null;
    
    try {
        const query = new URLSearchParams({
            page: "1",
            search: "",
            type: "",
            per_page: "20"
        });
        const result = await fetchServer(`/admin/domains?${query.toString()}`);
        if (result.status === 'success' && result.data) {
            initialData = result.data as DomainsResponse;
        }
    } catch (e) {
        console.error("Failed to fetch admin domains:", e);
    }

    return <DomainsClient initialData={initialData} />
}
