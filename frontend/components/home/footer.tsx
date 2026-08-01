import Link from "next/link"
import { BrandLogo } from "@/components/home/brand-logo"
import { BRAND_LOGO_CLASS, BRAND_LOGO_PX, BRAND_NAME_CLASS } from "@/components/home/brand-mark"
import { cn } from "@/lib/utils"

interface FooterProps {
    siteTitle: string
    logoUrl: string
    twitterUrl?: string
    linkedinUrl?: string
    youtubeUrl?: string
    facebookUrl?: string
}

interface SocialLink {
    title: string
    href: string
    path: string
}

export function Footer({
    siteTitle,
    logoUrl,
    twitterUrl,
    linkedinUrl,
    youtubeUrl,
    facebookUrl,
}: FooterProps) {
    const socials: SocialLink[] = []

    if (linkedinUrl?.trim()) {
        socials.push({
            title: "LinkedIn",
            href: linkedinUrl.trim(),
            path: "M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z",
        })
    }
    if (twitterUrl?.trim()) {
        socials.push({
            title: "X (Twitter)",
            href: twitterUrl.trim(),
            path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
        })
    }
    if (youtubeUrl?.trim()) {
        socials.push({
            title: "YouTube",
            href: youtubeUrl.trim(),
            path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
        })
    }
    if (facebookUrl?.trim()) {
        socials.push({
            title: "Facebook",
            href: facebookUrl.trim(),
            path: "M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z",
        })
    }

    return (
        <footer className="bg-[var(--ink,#0b1f1c)] text-[#c5d4cf]">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
                <div className="grid gap-10 md:grid-cols-4 md:gap-8">
                    <div className="md:col-span-2">
                        <Link
                            href="/"
                            className={cn("mb-4 flex items-center gap-2.5 text-white", BRAND_NAME_CLASS)}
                        >
                            <BrandLogo logoUrl={logoUrl} siteTitle={siteTitle} size={BRAND_LOGO_PX} className={BRAND_LOGO_CLASS} />
                            <span className="truncate">{siteTitle}</span>
                        </Link>
                        <p className="mb-5 max-w-sm text-sm leading-relaxed text-[#8aa099]">
                            Email verification built for clean lists and lasting sender reputation.
                        </p>
                        <p className="mb-6 text-sm text-[#6b857c]">
                            Chowgacha, Jessore, Khulna 7410 — Bangladesh
                        </p>

                        {socials.length > 0 && (
                            <div className="flex items-center gap-4">
                                {socials.map((social) => (
                                    <a
                                        key={social.title}
                                        href={social.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#8aa099] transition-colors hover:text-white"
                                        title={social.title}
                                        aria-label={social.title}
                                    >
                                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d={social.path} />
                                        </svg>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                            Product
                        </h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="#features" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Features
                                </Link>
                            </li>
                            <li>
                                <Link href="#pricing" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Pricing
                                </Link>
                            </li>
                            <li>
                                <Link href="#vision" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Vision
                                </Link>
                            </li>
                            <li>
                                <Link href="#support" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    FAQ
                                </Link>
                            </li>
                            <li>
                                <Link href="/register" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Get Started
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                            Legal
                        </h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="/terms" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link href="/privacy" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link href="#support" className="text-sm text-[#8aa099] transition-colors hover:text-white">
                                    Contact
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="my-8 h-px bg-white/10" />
                <p className="text-xs text-[#5a736c]">
                    © {new Date().getFullYear()} {siteTitle}. All rights reserved.
                </p>
            </div>
        </footer>
    )
}
