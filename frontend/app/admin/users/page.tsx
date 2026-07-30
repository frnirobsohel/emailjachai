import { Metadata } from "next"

export const metadata: Metadata = {
    title: "User Management",
}

import { fetchServer } from "@/lib/fetch-server"
import { ManageUsersClient, type ApiUser, type UsersListResponse } from "./users-client"

export default async function ManageUsersPage() {
    let initial: UsersListResponse | null = null

    try {
        const result = await fetchServer<UsersListResponse>("/admin/users?page=1&limit=25")
        if (result.status === "success" && result.data) {
            // Back-compat if an older API still returns a bare array
            if (Array.isArray(result.data)) {
                const users = result.data as unknown as ApiUser[]
                initial = {
                    users,
                    total: users.length,
                    page: 1,
                    limit: 25,
                    summary: {
                        total: users.length,
                        inactive: users.filter((u) => (u.status || "").toLowerCase() === "inactive").length,
                        suspended: users.filter((u) => (u.status || "").toLowerCase() === "suspended").length,
                        paid: users.filter((u) => u.is_paid).length,
                    },
                }
            } else {
                initial = result.data
            }
        }
    } catch (e) {
        console.error("Failed to fetch admin users:", e)
    }

    return <ManageUsersClient initialData={initial} />
}
