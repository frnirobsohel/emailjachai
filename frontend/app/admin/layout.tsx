export const dynamic = 'force-dynamic'
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { LayoutWrapper } from "@/components/layout/layout-wrapper"
import { fetchServer } from "@/lib/fetch-server"

type AuthMeUser = {
    role?: string
}

type AuthMeResponse = {
    user?: AuthMeUser
} & AuthMeUser

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const cookieStore = await cookies()
    const defaultCollapsed = cookieStore.get('sidebar_collapsed')?.value === 'true'

    let role = ""
    try {
        const result = await fetchServer<AuthMeResponse>("/auth/me")
        if (result.status === "success" && result.data) {
            const profile = result.data.user || result.data
            role = profile.role || ""
        }
    } catch (e) {
        console.error("Failed to fetch profile for admin layout:", e)
    }

    if (role !== "admin") {
        redirect(role ? "/dashboard" : "/login")
    }

    return (
        <LayoutWrapper defaultCollapsed={defaultCollapsed} sidebar={<Sidebar defaultCollapsed={defaultCollapsed} />}>
            {children}
        </LayoutWrapper>
    )
}
