"use client"

import Link from "next/link"
import Image from "next/image"
import { useSettings } from "@/lib/settings-context"
import { ShieldCheck } from "lucide-react"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const settings = useSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url
    const siteTagline = settings?.site_tagline || "Professional Email Verification Platform"

    return (
        <div className="flex min-h-screen flex-col items-center justify-start bg-slate-50 dark:bg-[#030712] p-4 md:p-8 py-10 md:py-16">
            <div className="w-full max-w-md flex flex-col items-center my-auto transition-all duration-200">
                {/* ─── Branding Header (Horizontal Layout with Tagline Below) ─── */}
                <div className="mb-6 text-center flex flex-col items-center">
                    <Link 
                        href="/" 
                        className="inline-flex items-center gap-2.5 font-bold text-2xl tracking-tight text-slate-900 dark:text-slate-100 hover:opacity-95 transition-opacity"
                    >
                        {logoUrl ? (
                            <Image 
                                src={logoUrl} 
                                alt={siteTitle} 
                                width={32} 
                                height={32} 
                                className="h-8 w-8 object-contain" 
                            />
                        ) : (
                            <ShieldCheck className="h-8 w-8 text-indigo-500 shrink-0" />
                        )}
                        <span>{siteTitle}</span>
                    </Link>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 max-w-[320px] text-center leading-relaxed">
                        {siteTagline}
                    </p>
                </div>

                {/* ─── Auth Form Card Container ─── */}
                <div className="w-full">
                    {children}
                </div>

                {/* ─── Footer Copyright ─── */}
                <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    <p>© {new Date().getFullYear()} {siteTitle}. All rights reserved.</p>
                </div>
            </div>
        </div>
    )
}
