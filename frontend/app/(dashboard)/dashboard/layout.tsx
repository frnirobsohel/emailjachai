import { Sidebar } from "@/components/layout/sidebar"
import { StoreInitializer } from "@/lib/store/store-initializer"
import { LayoutWrapper } from "@/components/layout/layout-wrapper"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <StoreInitializer stats={null} />
            <LayoutWrapper sidebar={<Sidebar />}>
                {children}
            </LayoutWrapper>
        </>
    )
}
