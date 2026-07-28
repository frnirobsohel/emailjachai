import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Profile Settings",
}

import { fetchServer } from "@/lib/fetch-server"
import { ProfileClient } from "@/features/profile/components/profile-client"

type ProfileUser = {
    id: number
    name: string
    email: string
    role: string
}

type AuthMeResponse = {
    user?: ProfileUser
} & Partial<ProfileUser>

export default async function ProfilePage() {
    let initialProfile: ProfileUser | null = null;
    
    const result = await fetchServer<AuthMeResponse>('/auth/me');
    if (result.status === 'success' && result.data) {
        const payload = result.data;
        initialProfile =
            payload.user ??
            (payload.id != null && payload.name && payload.email
                ? (payload as ProfileUser)
                : null);
    }

    return <ProfileClient initialProfile={initialProfile} />
}
