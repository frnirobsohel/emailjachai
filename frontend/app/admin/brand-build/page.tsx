import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Brand Settings",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { BrandBuildClient } from "./brand-build-client"

export default async function BrandBuildPage() {
    let initialData: Record<string, string> = {};
    
    try {
        const result = await fetchServer('/admin/settings');
        if (result.status === 'success') {
            const payload = result.data;
            if (Array.isArray(payload)) {
                for (const item of payload) {
                    if (item.setting_key) {
                        initialData[item.setting_key] = item.setting_value ?? "";
                    }
                }
            } else if (payload && typeof payload === "object") {
                initialData = payload as Record<string, string>;
            }
        }
    } catch (e) {
        console.error("Failed to fetch admin brand settings:", e);
    }

    return <BrandBuildClient initialData={initialData} />
}
