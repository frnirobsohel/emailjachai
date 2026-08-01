"use client"

import Link from "next/link"
import { BrandLogo } from "@/components/home/brand-logo"
import { BRAND_LOGO_CLASS, BRAND_LOGO_PX, BRAND_NAME_CLASS } from "@/components/home/brand-mark"
import { useSettings } from "@/lib/settings-context"
import { cn } from "@/lib/utils"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const settings = useSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url || settings?.favicon_url || "/logo.svg"
    const siteTagline = settings?.site_tagline || "Professional Email Verification Platform"

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-[#f0f4f2] px-4 py-10 text-[#0b1f1c] sm:px-6 md:py-16">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute inset-0 bg-[linear-gradient(165deg,#f5f8f6_0%,#eef3f1_48%,#e4ece9_100%)]" />
                <div className="absolute left-1/2 top-0 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-[#1a6b5c]/12 blur-[100px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(11,31,28,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(11,31,28,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            <div className="relative z-10 my-auto flex w-full max-w-md flex-col items-center">
                <div className="mb-7 text-center">
                    <Link
                        href="/"
                        className={cn(
                            "inline-flex items-center gap-2.5 text-[#0b1f1c] transition-opacity hover:opacity-90",
                            BRAND_NAME_CLASS
                        )}
                    >
                        <BrandLogo
                            logoUrl={logoUrl}
                            siteTitle={siteTitle}
                            size={BRAND_LOGO_PX}
                            className={BRAND_LOGO_CLASS}
                        />
                        <span className="truncate">{siteTitle}</span>
                    </Link>
                    <p className="mx-auto mt-2 max-w-[320px] text-xs font-medium leading-relaxed text-[#5a736c]">
                        {siteTagline}
                    </p>
                </div>

                <div className="w-full">{children}</div>

                <p className="mt-8 text-center text-xs text-[#6b857c]">
                    © {new Date().getFullYear()} {siteTitle}. All rights reserved.
                </p>
            </div>
        </div>
    )
}
