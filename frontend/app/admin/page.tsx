import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Admin Dashboard",
}

import { fetchServer } from "@/lib/fetch-server"
import { AdminDashboardClient } from "./_components/admin-client"
import type { AdminDashboardStats } from "@/stores/admin-store"

export default async function AdminDashboardPage() {
    let initialData: AdminDashboardStats | null = null

    try {
        const result = await fetchServer<AdminDashboardStats>("/admin/dashboard/stats")
        if (result.status === "success" && result.data) {
            initialData = result.data
        }
    } catch (e) {
        console.error("Failed to fetch admin stats:", e)
    }

    return <AdminDashboardClient initialData={initialData} />
}
