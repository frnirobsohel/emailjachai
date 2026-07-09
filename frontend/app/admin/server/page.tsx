import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Server Configuration",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { ServerClient, ServerNode } from "./server-client"

export default async function ServerPage() {
    let initialData: ServerNode[] = [];
    
    try {
        const result = await fetchServer('/admin/server/list');
        if (result.status === 'success' && Array.isArray(result.data)) {
            initialData = result.data;
        }
    } catch (e) {
        console.error("Failed to fetch admin servers:", e);
    }

    return <ServerClient initialData={initialData} />
}
