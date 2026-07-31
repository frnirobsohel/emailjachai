import { cache } from "react";
import { PublicSettings } from "@/lib/settings-context";

const SETTINGS_TIMEOUT_MS = 2500;

/**
 * Deduped per-request public settings fetch.
 * Uses tagged ISR cache so brand saves (revalidateTag) stay fresh without
 * blocking every page on a cold no-store round-trip.
 */
export const getPublicSettings = cache(async (): Promise<PublicSettings | null> => {
    const base = process.env.API_BASE_URL || "http://localhost:8000/api/v1";

    try {
        const res = await fetch(`${base}/settings/public`, {
            signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
            next: { revalidate: 60, tags: ["public-settings"] },
        });

        if (!res.ok) {
            return null;
        }

        const json = await res.json();
        if (json.status === "success") {
            return json.data;
        }

        return null;
    } catch (e) {
        console.error("Failed to fetch public settings:", e);
        return null;
    }
});
