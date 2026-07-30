import { Metadata } from "next"

export const metadata: Metadata = {
    title: "API Keys",
}

import { fetchServer } from "@/lib/fetch-server"
import { ApiKeysClient } from "@/features/api-keys/components/api-keys-client"
import type { ApiKey } from "@/features/api-keys/components/api-keys-client"

function resolveApiBaseUrl(): string {
    const raw =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_BASE_URL ||
        "http://localhost:8000/api/v1"
    return raw.replace(/\/$/, "")
}

export default async function ApiKeysPage() {
    let initialKeys: ApiKey[] = []

    const result = await fetchServer("/user/keys")
    if (result.status === "success" && result.data) {
        initialKeys = result.data as ApiKey[]
    }

    return <ApiKeysClient initialKeys={initialKeys} apiBaseUrl={resolveApiBaseUrl()} />
}
