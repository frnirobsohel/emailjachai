import type { ReactNode } from "react"
import { Navbar } from "@/components/home/navbar"
import { Footer } from "@/components/home/footer"

interface PublicSiteShellProps {
    siteTitle: string
    logoUrl: string
    twitterUrl?: string
    linkedinUrl?: string
    youtubeUrl?: string
    facebookUrl?: string
    children: ReactNode
}

export function PublicSiteShell({
    siteTitle,
    logoUrl,
    twitterUrl,
    linkedinUrl,
    youtubeUrl,
    facebookUrl,
    children,
}: PublicSiteShellProps) {
    return (
        <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#f0f4f2] text-[#0b1f1c] selection:bg-[#0f5c52]/20">
            <Navbar siteTitle={siteTitle} logoUrl={logoUrl} />
            {children}
            <Footer
                siteTitle={siteTitle}
                logoUrl={logoUrl}
                twitterUrl={twitterUrl}
                linkedinUrl={linkedinUrl}
                youtubeUrl={youtubeUrl}
                facebookUrl={facebookUrl}
            />
        </div>
    )
}
