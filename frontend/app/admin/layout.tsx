import { Sidebar } from "@/components/layout/sidebar"
import { LayoutWrapper } from "@/components/layout/layout-wrapper"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <LayoutWrapper sidebar={<Sidebar />}>
            {children}
        </LayoutWrapper>
    )
}
