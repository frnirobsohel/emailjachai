export const dynamic = 'force-dynamic';
import { cookies } from "next/headers"
import { Sidebar } from "@/components/layout/sidebar"
import { LayoutWrapper } from "@/components/layout/layout-wrapper"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const cookieStore = await cookies();
    const defaultCollapsed = cookieStore.get('sidebar_collapsed')?.value === 'true';

    return (
        <LayoutWrapper defaultCollapsed={defaultCollapsed} sidebar={<Sidebar defaultCollapsed={defaultCollapsed} />}>
            {children}
        </LayoutWrapper>
    )
}
