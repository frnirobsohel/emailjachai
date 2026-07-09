import { PublicSettings } from "@/lib/settings-context";

export async function getPublicSettings(): Promise<PublicSettings | null> {
    try {
        const res = await fetch(`${process.env.API_BASE_URL || 'http://localhost:8000/api/v1'}/settings/public`, { 
            next: { tags: ['public-settings'] } 
        });
        
        if (!res.ok) {
            return null;
        }
        
        const json = await res.json();
        if (json.status === 'success') {
            return json.data;
        }
        
        return null;
    } catch (e) {
        console.error("Failed to fetch public settings:", e);
        return null;
    }
}
