export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { ManageUsersClient, ApiUser } from "./users-client"

export default async function ManageUsersPage() {
    let initialData: ApiUser[] = [];
    
    try {
        const result = await fetchServer('/admin/users');
        if (result.status === 'success' && Array.isArray(result.data)) {
            initialData = result.data;
        }
    } catch (e) {
        console.error("Failed to fetch admin users:", e);
    }

    return <ManageUsersClient initialData={initialData} />
}
