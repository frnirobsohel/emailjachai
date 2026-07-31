import Link from "next/link"
import { BrandLogo } from "@/components/home/brand-logo"

interface NavbarProps {
    siteTitle: string
    logoUrl: string
}

export function Navbar({ siteTitle, logoUrl }: NavbarProps) {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#f0f4f2]/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
                <Link
                    href="/"
                    className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-[#0b1f1c] sm:gap-2.5 sm:text-base"
                >
                    <BrandLogo logoUrl={logoUrl} siteTitle={siteTitle} size={28} className="h-7 w-7 object-contain" />
                    <span className="truncate">{siteTitle}</span>
                </Link>
                <nav className="flex shrink-0 items-center gap-0.5 sm:gap-2">
                    <Link
                        href="#features"
                        className="hidden px-3 py-2 text-sm text-[#4a635c] transition-colors hover:text-[#0b1f1c] md:inline-flex"
                    >
                        Features
                    </Link>
                    <Link
                        href="#pricing"
                        className="hidden px-3 py-2 text-sm text-[#4a635c] transition-colors hover:text-[#0b1f1c] md:inline-flex"
                    >
                        Pricing
                    </Link>
                    <Link
                        href="#vision"
                        className="hidden px-3 py-2 text-sm text-[#4a635c] transition-colors hover:text-[#0b1f1c] md:inline-flex"
                    >
                        Vision
                    </Link>
                    <Link
                        href="#support"
                        className="hidden px-3 py-2 text-sm text-[#4a635c] transition-colors hover:text-[#0b1f1c] md:inline-flex"
                    >
                        Support
                    </Link>
                    <Link
                        href="/login"
                        className="px-2.5 py-2 text-sm font-medium text-[#0b1f1c] transition-colors hover:text-[#0f5c52] sm:px-3"
                    >
                        Login
                    </Link>
                    <Link
                        href="/register"
                        className="ml-0.5 rounded-md border border-[#08352f] bg-[#0f5c52] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0b4a42] sm:ml-1 sm:px-4"
                    >
                        Get Started
                    </Link>
                </nav>
            </div>
        </header>
    )
}
