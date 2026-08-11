import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Package Management",
}

import { fetchServer } from "@/lib/fetch-server"
import { PackagesClient, type PackageRow } from "./packages-client"

function normalizePackageRow(raw: PackageRow): PackageRow {
    const features = Array.isArray(raw.features)
        ? raw.features.filter((f): f is string => typeof f === "string")
        : []
    return {
        ...raw,
        features,
        offer_price: raw.offer_price ?? 0,
        is_public: raw.is_public ?? true,
        popular: raw.popular ?? false,
        status: raw.status || "inactive",
    }
}

export default async function PackagesPage() {
    let initialData: PackageRow[] = [];
    
    try {
        const result = await fetchServer('/admin/packages');
        if (result.status === 'success' && Array.isArray(result.data)) {
            initialData = result.data.map(normalizePackageRow);
        }
    } catch (e) {
        console.error("Failed to fetch admin packages:", e);
    }

    return <PackagesClient initialData={initialData} />
}
