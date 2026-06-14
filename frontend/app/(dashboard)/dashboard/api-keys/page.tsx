export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { ApiKeysClient } from "@/features/api-keys/components/api-keys-client"
import type { ApiKey } from "@/features/api-keys/components/api-keys-client"

export default async function ApiKeysPage() {
    let initialKeys: ApiKey[] = [];
    
    const result = await fetchServer('/user/keys');
    if (result.status === 'success' && result.data) {
        initialKeys = result.data as ApiKey[];
    }

    return <ApiKeysClient initialKeys={initialKeys} />
}
