import type { Metadata } from "next"
import Link from "next/link"
import { PublicSiteShell } from "@/components/home/public-site-shell"
import { InstallCommandBox } from "@/components/self-host/install-command-box"
import {
    DEPLOYMENT_METHODS,
    GITHUB_REPO_URL,
    INSTALL_COMMAND,
    SELF_HOST_EDITIONS,
    SELF_HOST_FAQ,
    SELF_HOST_FEATURES,
} from "@/config/self-host"
import { getPublicSettings } from "@/lib/services/settings"
import { buildShareMetadata, getPublicBrandMeta } from "@/lib/public-metadata"

export async function generateMetadata(): Promise<Metadata> {
    const { title: siteTitle, baseUrl } = await getPublicBrandMeta()
    const pageTitle = "Self-Host — 100% Free & Open Source"
    const description = `Deploy ${siteTitle} on your own servers with a single command. 100% Free & Open Source email verification with unlimited capacity and complete privacy.`
    const share = buildShareMetadata({
        title: `${pageTitle} | ${siteTitle}`,
        description,
        siteName: siteTitle,
        url: baseUrl ? `${baseUrl}/self-host` : undefined,
        imageAlt: `${siteTitle} Open Source Self-Host`,
    })

    return {
        title: pageTitle,
        description,
        ...share,
        robots: { index: true, follow: true },
    }
}

export default async function SelfHostPage() {
    const settings = await getPublicSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url || settings?.favicon_url || "/logo.svg"

    return (
        <PublicSiteShell
            siteTitle={siteTitle}
            logoUrl={logoUrl}
            twitterUrl={settings?.twitter_url}
            linkedinUrl={settings?.linkedin_url}
            youtubeUrl={settings?.youtube_url}
            facebookUrl={settings?.facebook_url}
        >
            <main className="flex-1">
                {/* ─── Hero Section ─────────────────────────────────────────── */}
                <section className="relative overflow-hidden bg-gradient-to-b from-[#0a231f] to-[#0d342e] pt-24 pb-16 text-white sm:pb-20 md:pt-32 md:pb-28">
                    <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 px-3.5 py-1 text-xs font-medium text-emerald-300 backdrop-blur-sm sm:mb-6 sm:text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            100% Free & Open Source Email Verification
                        </div>

                        <h1 className="mx-auto mb-5 max-w-4xl text-3xl font-bold leading-[1.12] tracking-tight sm:text-5xl md:text-6xl">
                            Own your email verification stack
                        </h1>

                        <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-emerald-100/80 sm:text-base md:text-lg">
                            Deploy on your own VPS with a single command. Zero credit markups, complete list
                            privacy, and verification speed that scales with your hardware.
                        </p>

                        {/* Interactive Terminal Box */}
                        <div id="quick-install" className="mx-auto max-w-3xl pt-2">
                            <InstallCommandBox command={INSTALL_COMMAND} />
                        </div>

                        {/* Quick action buttons */}
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm">
                            <a
                                href={GITHUB_REPO_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 font-medium text-white transition-colors hover:bg-white/20"
                            >
                                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                                </svg>
                                Star on GitHub
                            </a>
                            <a
                                href="#deployment-methods"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-emerald-500 px-4 py-2.5 font-semibold text-[#0a231f] transition-colors hover:bg-emerald-400"
                            >
                                Deployment Options ↓
                            </a>
                            <Link
                                href="/docs/DEPLOYMENT.md"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-emerald-200/80 transition-colors hover:text-white"
                            >
                                Read Setup Guide →
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ─── Deployment Methods ──────────────────────────────────── */}
                <section id="deployment-methods" className="relative bg-[#f7faf8] py-16 md:py-24">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-12 max-w-2xl text-center">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0f5c52]">
                                Flexibility
                            </p>
                            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Choose how you want to deploy
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                From a single bash command on a VPS to Dokploy, Coolify, and Docker Compose.
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-3">
                            {DEPLOYMENT_METHODS.map((method) => (
                                <div
                                    key={method.title}
                                    className="flex flex-col justify-between rounded-xl border border-[#0b1f1c]/10 bg-white p-6 shadow-sm transition-all hover:border-[#0f5c52]/40 hover:shadow-md"
                                >
                                    <div>
                                        <div className="mb-4 flex items-center justify-between">
                                            <span className="rounded-full bg-[#f0f7f5] px-2.5 py-1 font-mono text-xs font-medium text-[#0f5c52]">
                                                {method.badge}
                                            </span>
                                        </div>
                                        <h3 className="mb-2 text-lg font-bold text-[#0b1f1c]">
                                            {method.title}
                                        </h3>
                                        <p className="mb-4 text-sm leading-relaxed text-[#4a635c]">
                                            {method.description}
                                        </p>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-[#0b1f1c]/5">
                                        <a
                                            href={method.docsHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center text-xs font-semibold text-[#0f5c52] hover:underline"
                                        >
                                            View documentation →
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Editions: Community vs Enterprise ─────────────────────── */}
                <section id="editions" className="relative bg-white py-16 md:py-24">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-12 max-w-2xl text-center">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0f5c52]">
                                Transparent & Scalable
                            </p>
                            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Simple, transparent self-hosting
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                Free forever for individual self-hosters, with enterprise clusters for high-volume senders.
                            </p>
                        </div>

                        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
                            {SELF_HOST_EDITIONS.map((edition) => (
                                <div
                                    key={edition.name}
                                    className={`flex flex-col justify-between rounded-2xl border p-6 sm:p-8 ${
                                        edition.isPopular
                                            ? "border-[#0f5c52] bg-gradient-to-b from-[#f0f7f5] to-white shadow-lg"
                                            : "border-[#0b1f1c]/10 bg-[#fafbfa]"
                                    }`}
                                >
                                    <div>
                                        <div className="mb-6 flex items-center justify-between">
                                            <span className="rounded-full bg-[#0f5c52]/10 px-3 py-1 text-xs font-semibold text-[#0f5c52]">
                                                {edition.badge}
                                            </span>
                                            {edition.isPopular && (
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                                                    Most Popular
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="mb-1 text-xl font-bold text-[#0b1f1c]">
                                            {edition.name}
                                        </h3>
                                        <div className="mb-4 flex items-baseline gap-1.5">
                                            <span className="text-4xl font-extrabold tracking-tight text-[#0b1f1c]">
                                                {edition.price}
                                            </span>
                                            {edition.period && (
                                                <span className="text-xs text-[#5a736c]">
                                                    / {edition.period}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mb-6 text-sm text-[#4a635c]">
                                            {edition.tagline}
                                        </p>

                                        <ul className="mb-8 space-y-3">
                                            {edition.features.map((feature) => (
                                                <li
                                                    key={feature}
                                                    className="flex items-start gap-2.5 text-sm text-[#3d564f]"
                                                >
                                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f5c52]" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <a
                                        href={edition.ctaHref}
                                        className={`inline-flex min-h-11 w-full items-center justify-center rounded-lg py-2.5 text-center text-sm font-semibold transition-all ${
                                            edition.isPopular
                                                ? "border border-[#08352f] bg-[#0f5c52] text-white hover:bg-[#0b4a42] shadow-sm"
                                                : "border border-[#0b1f1c]/25 bg-white text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                                        }`}
                                    >
                                        {edition.ctaLabel}
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Why Self-Host Features ───────────────────────────────── */}
                <section className="relative bg-[#f7faf8] py-16 md:py-24">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-12 max-w-2xl text-center">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0f5c52]">
                                Advantages
                            </p>
                            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Why teams choose self-hosted Email Jachai
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                NeverBounce and ZeroBounce accuracy with the freedom of open-source infrastructure.
                            </p>
                        </div>

                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {SELF_HOST_FEATURES.map((feature, index) => (
                                <div
                                    key={feature.title}
                                    className="rounded-xl border border-[#0b1f1c]/10 bg-white p-6 shadow-sm"
                                >
                                    <p className="mb-3 font-mono text-xs font-bold text-[#0f5c52]">
                                        0{index + 1}
                                    </p>
                                    <h3 className="mb-2 text-base font-bold text-[#0b1f1c]">
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-[#4a635c]">
                                        {feature.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── FAQ ─────────────────────────────────────────────────── */}
                <section id="faq" className="relative bg-white py-16 md:py-24">
                    <div className="mx-auto max-w-4xl px-4 sm:px-6">
                        <div className="mx-auto mb-12 max-w-xl text-center">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#0f5c52]">
                                FAQ
                            </p>
                            <h2 className="mb-3 text-2xl font-bold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Frequently asked questions
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                Everything you need to know about self-hosting and open-source deployment.
                            </p>
                        </div>

                        <div className="space-y-6">
                            {SELF_HOST_FAQ.map((item, index) => (
                                <div
                                    key={item.question}
                                    className="rounded-xl border border-[#0b1f1c]/10 bg-[#fafbfa] p-5 sm:p-6"
                                >
                                    <h3 className="mb-2 text-base font-bold text-[#0b1f1c]">
                                        <span className="mr-2 font-mono text-xs text-[#0f5c52]">
                                            0{index + 1}.
                                        </span>
                                        {item.question}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-[#4a635c]">
                                        {item.answer}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Final CTA ────────────────────────────────────────────── */}
                <section className="relative bg-[#0d342e] py-16 text-white md:py-24">
                    <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
                        <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-4xl">
                            Ready to take control of your email verification?
                        </h2>
                        <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-emerald-100/80 sm:text-base">
                            Clone the repo or run the 1-command installer. Deploy your own high-accuracy verification engine in minutes.
                        </p>
                        <div className="flex flex-col justify-center gap-3 sm:flex-row">
                            <a
                                href="#quick-install"
                                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-400 px-6 py-3 text-sm font-bold text-[#0a231f] transition-all hover:bg-emerald-300"
                            >
                                Install with 1 Command
                            </a>
                            <a
                                href={GITHUB_REPO_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                            >
                                Star on GitHub ⭐
                            </a>
                        </div>
                    </div>
                </section>
            </main>
        </PublicSiteShell>
    )
}
