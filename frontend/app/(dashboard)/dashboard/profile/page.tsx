import { fetchServer } from "@/lib/fetch-server"
import { ProfileClient } from "./profile-client"

export default async function ProfilePage() {
    let initialProfile = null;
    
    const result = await fetchServer('/auth/me');
    if (result.status === 'success' && result.data) {
        initialProfile = result.data.user || result.data;
    }

    return <ProfileClient initialProfile={initialProfile} />
}
