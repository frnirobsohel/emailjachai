import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Package Management",
}

import { fetchServer } from "@/lib/fetch-server"
import { PackagesClient, type PackageRow } from "./packages-client"

export default async function PackagesPage() {
    let initialData: PackageRow[] = [];
    
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
