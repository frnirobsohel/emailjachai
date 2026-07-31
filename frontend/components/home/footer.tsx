import Link from "next/link"
import { BrandLogo } from "@/components/home/brand-logo"

interface FooterProps {
    siteTitle: string
    logoUrl: string
    twitterUrl?: string
    linkedinUrl?: string
    githubUrl?: string
    facebookUrl?: string
    youtubeUrl?: string
}

export function Footer({
    siteTitle,
    logoUrl,
    twitterUrl = "#",
    linkedinUrl = "#",
    githubUrl,
    facebookUrl = "#",
    youtubeUrl = "#",
}: FooterProps) {
    const socials = [
        {
            title: "LinkedIn",
            href: linkedinUrl || "#",
            path: "M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z",
        },
        {
            title: "X (Twitter)",
            href: twitterUrl || "#",
            path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
        },
        {
            title: "YouTube",
            href: youtubeUrl || "#",
            path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
        },
        {
            title: "Facebook",
            href: facebookUrl || "#",
            path: "M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z",
        },
    ]

    if (githubUrl) {
        socials.push({
            title: "GitHub",
            href: githubUrl,
            path: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
        })
    }

    return (
        <footer className="bg-[var(--ink,#0b1f1c)] text-[#c5d4cf]">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
                <div className="grid gap-10 md:grid-cols-4 md:gap-8">
                    <div className="md:col-span-2">
                        <Link
                            href="/"
                            className="mb-4 flex items-center gap-2.5 text-lg font-semibold text-white"
                        >
                            <BrandLogo logoUrl={logoUrl} siteTitle={siteTitle} size={24} className="h-6 w-6 object-contain" />
                            {siteTitle}
                        </Link>
                        <p className="mb-5 max-w-sm text-sm leading-relaxed text-[#8aa099]">
                            Email verification built for clean lists and lasting sender reputation.
                        </p>
                        <p className="mb-6 text-sm text-[#6b857c]">
                            Chowgacha, Jessore, Khulna 7410 — Bangladesh
                        </p>

                        <div className="flex items-center gap-4">
                            {socials.map((social) => (
                                <a
                                    key={social.title}
                                    href={social.href}
                                    target={social.href !== "#" ? "_blank" : undefined}
                                    rel={social.href !== "#" ? "noopener noreferrer" : undefined}
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
