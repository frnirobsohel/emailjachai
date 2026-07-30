import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Brand Settings",
}

import { fetchServer } from "@/lib/fetch-server"
import { BrandBuildClient } from "./brand-build-client"

export default async function BrandBuildPage() {
    let initialData: Record<string, string> = {}

    try {
        const result = await fetchServer("/admin/settings/brand")
        if (result.status === "success" && result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
            initialData = result.data as Record<string, string>
        }
    } catch (e) {
        console.error("Failed to fetch admin brand settings:", e)
    }

    return <BrandBuildClient initialData={initialData} />
}
