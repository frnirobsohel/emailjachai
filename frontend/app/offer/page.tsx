import type { Metadata } from "next"
import Link from "next/link"
import { PublicSiteShell } from "@/components/home/public-site-shell"
import { ACTIVE_OFFERS, UPCOMING_OFFERS } from "@/config/offers"
import { getPublicSettings } from "@/lib/services/settings"
import { buildShareMetadata, getPublicBrandMeta } from "@/lib/public-metadata"

export async function generateMetadata(): Promise<Metadata> {
    const { title: siteTitle, baseUrl } = await getPublicBrandMeta()
    const pageTitle = "Offers"
    const description =
        "Launch Special: 1,000,000 email verification credits for $114 — first 30 customers, valid through September 11, 2026."
    const share = buildShareMetadata({
        title: `Launch Special Offer — 1 Million Credits | ${siteTitle}`,
        description,
        siteName: siteTitle,
        url: baseUrl ? `${baseUrl}/offer` : undefined,
        imageAlt: `${siteTitle} Launch Special Offer`,
    })

    return {
        title: pageTitle,
        description,
        ...share,
        robots: { index: true, follow: true },
    }
}

export default async function OfferPage() {
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
                        Offers & deals
                    </p>
                    <h1 className="mb-3 text-[1.85rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-4xl">
                        Current & upcoming offers
                    </h1>
                    <p className="mb-10 text-sm leading-relaxed text-[#4a635c] sm:text-base">
                        Limited windows on credits and self-host licences. Dates can change — claim while
                        active.
                    </p>

                    <section className="mb-12" aria-labelledby="current-offers-heading">
                        <h2
                            id="current-offers-heading"
                            className="mb-4 text-lg font-semibold tracking-tight text-[#0b1f1c]"
                        >
                            <span className="mr-2 font-mono text-[11px] text-[#0f5c52]">01</span>
                            Current offers
                        </h2>
                        <div className="space-y-6 border-t-2 border-[#0f5c52]/25 pt-5">
                            {ACTIVE_OFFERS.map((offer) => (
                                <div
                                    key={offer.title}
                                    className={`border p-5 sm:p-6 ${
                                        offer.isHighlighted
                                            ? "border-[#0f5c52] bg-[#f0f7f5]"
                                            : "border-[#0b1f1c]/10 bg-[#fafbfa]"
                                    }`}
                                >
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#0f5c52]">
                                        {offer.badge}
                                    </p>
                                    <h3 className="mb-2 text-base font-semibold tracking-tight text-[#0b1f1c] sm:text-lg">
                                        {offer.title}
                                    </h3>
                                    <p className="mb-4 text-sm leading-relaxed text-[#4a635c]">
                                        {offer.description}
                                    </p>
                                    {offer.highlights && offer.highlights.length > 0 && (
                                        <ul className="mb-4 space-y-2">
                                            {offer.highlights.map((item) => (
                                                <li
                                                    key={item}
                                                    className="flex gap-2 text-sm text-[#3d564f]"
                                                >
                                                    <span
                                                        className="mt-1.5 h-1 w-1 shrink-0 bg-[#0f5c52]"
                                                        aria-hidden
                                                    />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs text-[#6b857c]">
                                            {offer.validFrom ? (
                                                <>
                                                    Valid:{" "}
                                                    <span className="font-medium text-[#3d564f]">
                                                        {offer.validFrom}
                                                    </span>
                                                    {" – "}
                                                    <span className="font-medium text-[#3d564f]">
                                                        {offer.validUntil}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    Valid until:{" "}
                                                    <span className="font-medium text-[#3d564f]">
                                                        {offer.validUntil}
                                                    </span>
                                                </>
                                            )}
                                        </p>
                                        {offer.isExternal ? (
                                            <a
                                                href={offer.ctaHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex min-h-11 items-center rounded-md border border-[#08352f] bg-[#0f5c52] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0b4a42]"
                                            >
                                                {offer.ctaLabel}
                                            </a>
                                        ) : (
                                            <Link
                                                href={offer.ctaHref}
                                                className="inline-flex min-h-11 items-center rounded-md border border-[#08352f] bg-[#0f5c52] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0b4a42]"
                                            >
                                                {offer.ctaLabel}
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section aria-labelledby="upcoming-offers-heading">
                        <h2
                            id="upcoming-offers-heading"
                            className="mb-4 text-lg font-semibold tracking-tight text-[#0b1f1c]"
                        >
                            <span className="mr-2 font-mono text-[11px] text-[#0f5c52]">02</span>
                            Upcoming offers
                        </h2>
                        <div className="space-y-6 border-t-2 border-[#0f5c52]/25 pt-5">
                            {UPCOMING_OFFERS.map((offer) => (
                                <div key={offer.title}>
                                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 className="text-base font-semibold tracking-tight text-[#0b1f1c]">
                                            {offer.title}
                                        </h3>
                                        <span className="text-xs text-[#6b857c]">{offer.dateLabel}</span>
                                    </div>
                                    <p className="text-sm leading-relaxed text-[#4a635c] sm:text-[0.95rem]">
                                        {offer.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-8 text-xs text-[#6b857c]">
                            Offers may change. Follow social channels for the earliest notice.
                        </p>
                    </section>
                </article>
            </main>
        </PublicSiteShell>
    )
}
