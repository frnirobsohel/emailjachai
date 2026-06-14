export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { ResellerTransferClient } from "./reseller-transfer-client"

export default async function ResellerTransferPage() {
    let initialRole = "user";
    
    try {
        const result = await fetchServer('/auth/me');
        if (result.status === 'success' && result.data) {
            const profile = result.data.user || result.data;
            initialRole = profile.role || "user";
        }
    } catch (e) {
        console.error("Failed to fetch profile for reseller check:", e);
    }

    return <ResellerTransferClient initialRole={initialRole} />
}
