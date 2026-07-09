import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Server Monitoring",
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
