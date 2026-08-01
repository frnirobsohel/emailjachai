"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { BrandLogo } from "@/components/home/brand-logo"
import { useSettings } from "@/lib/settings-context"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const settings = useSettings()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Don't render real values until client is mounted to avoid hydration mismatch
    // and prevent showing the default fallback name before settings load
    const siteTitle = mounted ? (settings?.site_title || "EmailJachai Pro") : ""
    const logoUrl = mounted ? (settings?.logo_url || settings?.favicon_url || "/logo.svg") : null
    const siteTagline = mounted ? (settings?.site_tagline || "Professional Email Verification Platform") : ""

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
                        className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-[#0b1f1c] transition-opacity hover:opacity-90 sm:text-2xl"
                    >
                        {/* Fixed-size wrapper prevents logo jump on reload */}
                        <span className="inline-block h-8 w-8 shrink-0">
                            {logoUrl && (
                                <BrandLogo
                                    logoUrl={logoUrl}
                                    siteTitle={siteTitle || "Logo"}
                                    size={32}
                                    className="h-8 w-8 object-contain"
                                />
                            )}
                        </span>
                        {/* Stable-width container prevents title from jumping */}
                        <span className="min-w-[120px]">{siteTitle}</span>
                    </Link>
                    <p className="mx-auto mt-2 max-w-[320px] text-xs font-medium leading-relaxed text-[#5a736c]">
                        {siteTagline}
                    </p>
                </div>

                <div className="w-full">{children}</div>

                <p className="mt-8 text-center text-xs text-[#6b857c]">
                    © {new Date().getFullYear()}{siteTitle ? ` ${siteTitle}.` : ""} All rights reserved.
                </p>
            </div>
        </div>
    )
}
