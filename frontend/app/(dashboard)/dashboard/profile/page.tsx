import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Profile Settings",
}

import { fetchServer } from "@/lib/fetch-server"
import { ProfileClient } from "@/features/profile/components/profile-client"
import type { ProfileUser, WebhookSettings } from "@/features/profile/components/profile-client"

type AuthMeResponse = {
    user?: ProfileUser
} & Partial<ProfileUser>

export default async function ProfilePage() {
    let initialProfile: ProfileUser | null = null
    let initialWebhook: WebhookSettings | null = null

    const [meResult, whResult] = await Promise.all([
        fetchServer<AuthMeResponse>("/auth/me"),
        fetchServer<WebhookSettings>("/user/webhook"),
    ])

    if (meResult.status === "success" && meResult.data) {
        const payload = meResult.data
        initialProfile =
            payload.user ??
            (payload.id != null && payload.name && payload.email
                ? (payload as ProfileUser)
                : null)
    }

    if (whResult.status === "success" && whResult.data) {
        initialWebhook = {
            webhook_url: whResult.data.webhook_url || "",
            has_secret: Boolean(whResult.data.has_secret),
        }
    }

    return <ProfileClient initialProfile={initialProfile} initialWebhook={initialWebhook} />
}
