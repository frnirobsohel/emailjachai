import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
    title: "Reseller Credit Transfer",
}

import { fetchServer } from "@/lib/fetch-server"
import { ResellerTransferClient } from "./reseller-transfer-client"

type AuthMeUser = {
    role?: string
}

type AuthMeResponse = {
    user?: AuthMeUser
} & AuthMeUser

export default async function ResellerTransferPage() {
    let role = "user"

    try {
        const result = await fetchServer<AuthMeResponse>("/auth/me")
        if (result.status === "success" && result.data) {
            const profile = result.data.user || result.data
            role = profile.role || "user"
        }
    } catch (e) {
        console.error("Failed to fetch profile for reseller check:", e)
    }

    if (role !== "reseller" && role !== "admin") {
        redirect("/dashboard")
    }

    return <ResellerTransferClient />
}
