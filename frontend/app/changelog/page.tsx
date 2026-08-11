import type { Metadata } from "next"
import { PublicSiteShell } from "@/components/home/public-site-shell"
import { CHANGELOG_RELEASES } from "@/config/changelog"
import { getPublicSettings } from "@/lib/services/settings"
import { buildShareMetadata, getPublicBrandMeta } from "@/lib/public-metadata"

export async function generateMetadata(): Promise<Metadata> {
    const { title: siteTitle, baseUrl } = await getPublicBrandMeta()
    const pageTitle = "Changelog"
    const description = `Product updates and new features in ${siteTitle}.`
    const share = buildShareMetadata({
        title: `${pageTitle} | ${siteTitle}`,
        description,
        siteName: siteTitle,
        url: baseUrl ? `${baseUrl}/changelog` : undefined,
        imageAlt: `${siteTitle} Changelog`,
    })

    return {
        title: pageTitle,
        description,
        ...share,
        robots: { index: true, follow: true },
    }
}

export default async function ChangelogPage() {
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
            <main className="flex-1 px-4 pb-12 pt-24 sm:px-6 md:pb-16 md:pt-28">
                <article className="mx-auto max-w-3xl">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0f5c52]">
                        Product updates
                    </p>
                    <h1 className="mb-3 text-[1.85rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-4xl">
                        Changelog
                    </h1>
                    <p className="mb-10 text-sm leading-relaxed text-[#4a635c] sm:text-base">
                        What changed for you — verification results, credits, API access, rate limits, and
                        performance. Newest first.
                    </p>

                    <div className="space-y-10">
                        {CHANGELOG_RELEASES.map((release, index) => (
                            <section
                                key={release.version}
                                aria-labelledby={`release-${release.version}`}
                            >
                                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                    <h2
                                        id={`release-${release.version}`}
                                        className="text-lg font-semibold tracking-tight text-[#0b1f1c]"
                                    >
                                        <span className="mr-2 font-mono text-[11px] text-[#0f5c52]">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        {release.version}
                                    </h2>
                                    <time className="text-xs text-[#6b857c]">{release.date}</time>
                                </div>
                                <div className="border-t-2 border-[#0f5c52]/25 pt-4">
                                    <p className="mb-3 text-sm font-medium text-[#0b1f1c]">
                                        {release.title}
                                    </p>
                                    <ul className="space-y-2.5">
                                        {release.items.map((item) => (
                                            <li
                                                key={item}
                                                className="flex gap-2 text-sm leading-relaxed text-[#4a635c] sm:text-[0.95rem]"
                                            >
                                                <span
                                                    className="mt-1.5 h-1 w-1 shrink-0 bg-[#0f5c52]"
                                                    aria-hidden
                                                />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </section>
                        ))}
                    </div>
                </article>
            </main>
        </PublicSiteShell>
    )
}
