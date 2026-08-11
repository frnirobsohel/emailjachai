import type { Metadata } from "next"
import { PublicSiteShell } from "@/components/home/public-site-shell"
import {
    SELF_HOST_FAQ,
    SELF_HOST_FEATURES,
    SELF_HOST_LICENSES,
    SELF_HOST_PURCHASE_URL,
} from "@/config/self-host"
import { getPublicSettings } from "@/lib/services/settings"
import { buildShareMetadata, getPublicBrandMeta } from "@/lib/public-metadata"

export async function generateMetadata(): Promise<Metadata> {
    const { title: siteTitle, baseUrl } = await getPublicBrandMeta()
    const pageTitle = "Self-Host"
    const description = `Run ${siteTitle} on your own infrastructure. One-time licence, full control, lifetime updates.`
    const share = buildShareMetadata({
        title: `${pageTitle} | ${siteTitle}`,
        description,
        siteName: siteTitle,
        url: baseUrl ? `${baseUrl}/self-host` : undefined,
        imageAlt: `${siteTitle} Self-Host`,
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
                <section className="relative overflow-hidden pt-24 pb-14 sm:pb-16 md:pt-32 md:pb-24">
                    <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
                        <p className="mb-4 text-sm font-semibold tracking-tight text-[#0f5c52] sm:mb-5 sm:text-base">
                            {siteTitle}
                        </p>
                        <h1 className="mb-4 text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-[#0b1f1c] sm:mb-5 sm:text-5xl md:text-6xl">
                            Own your email verification stack
                        </h1>
                        <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-[#4a635c] sm:mb-10 sm:text-base md:text-lg">
                            Run the platform on your servers. One-time licence, no monthly SaaS fee, and
                            capacity limited only by the hardware you operate.
                        </p>
                        <div className="flex flex-col justify-center gap-3 sm:flex-row">
                            <a
                                href="#pricing"
                                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#08352f] bg-[#0f5c52] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0b4a42]"
                            >
                                View licences
                            </a>
                            <a
                                href="#faq"
                                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#0b1f1c]/25 bg-white px-6 py-3 text-sm font-medium text-[#0b1f1c] transition-colors hover:border-[#0f5c52] hover:text-[#0f5c52]"
                            >
                                Read FAQ
                            </a>
                        </div>
                    </div>
                </section>

                <section id="pricing" className="relative bg-white py-16 md:py-28">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-10 max-w-xl text-center md:mb-14">
                            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0f5c52]">
                                Licensing
                            </p>
                            <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Choose your licence
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                One-time payment. Lifetime product-line updates included.
                            </p>
                        </div>

                        <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
                            {SELF_HOST_LICENSES.map((license) => (
                                <div
                                    key={license.name}
                                    className={`flex flex-col border p-5 sm:p-7 ${
                                        license.isPopular
                                            ? "border-[#0f5c52] bg-[#f0f7f5]"
                                            : "border-[#0b1f1c]/10 bg-[#fafbfa]"
                                    }`}
                                >
                                    <div className="mb-6 flex items-baseline justify-between gap-2">
                                        <h3 className="text-base font-semibold text-[#0b1f1c]">
                                            {license.name}
                                        </h3>
                                        {license.isPopular && (
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0f5c52]">
                                                Popular
                                            </span>
                                        )}
                                    </div>
                                    <p className="mb-1 text-4xl font-semibold tracking-tight text-[#0b1f1c]">
                                        ${license.price}
                                    </p>
                                    <p className="mb-8 text-sm text-[#5a736c]">{license.tagline}</p>

                                    <ul className="mb-8 flex-1 space-y-3">
                                        {license.features.map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex gap-2 text-sm text-[#3d564f]"
                                            >
                                                <span
                                                    className="mt-1.5 h-1 w-1 shrink-0 bg-[#0f5c52]"
                                                    aria-hidden
                                                />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>

                                    <a
                                        href={SELF_HOST_PURCHASE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-flex min-h-11 w-full items-center justify-center rounded-md border py-2.5 text-center text-sm font-semibold transition-colors ${
                                            license.isPopular
                                                ? "border-[#08352f] bg-[#0f5c52] text-white hover:bg-[#0b4a42]"
                                                : "border-[#0b1f1c]/25 bg-white text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                                        }`}
                                    >
                                        Buy on Gumroad
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="relative bg-[#f7faf8] py-16 md:py-28">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
                            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0f5c52]">
                                Why self-host
                            </p>
                            <h2 className="mb-3 text-[1.65rem] font-semibold tracking-[-0.02em] text-[#0b1f1c] sm:text-[1.85rem] md:mb-4 md:text-[2.25rem]">
                                Control, privacy, and capacity
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base md:text-[1.05rem]">
                                Keep lists on your network and scale workers to the machines you already trust.
                            </p>
                        </div>
                        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-12">
                            {SELF_HOST_FEATURES.map((feature, index) => (
                                <div
                                    key={feature.title}
                                    className="border-t-2 border-[#0f5c52]/35 pt-5"
                                >
                                    <p className="mb-3 font-mono text-[11px] tracking-wider text-[#0f5c52]">
                                        {String(index + 1).padStart(2, "0")}
                                    </p>
                                    <h3 className="mb-2.5 text-base font-semibold tracking-tight text-[#0b1f1c] sm:text-lg">
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

                <section id="faq" className="relative bg-[#eef3f0] py-16 md:py-28">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6">
                        <div className="mx-auto mb-10 max-w-xl text-center md:mb-12">
                            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0f5c52]">
                                Help
                            </p>
                            <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                                Frequently asked questions
                            </h2>
                            <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                                Licences, hosting, and support — answered plainly.
                            </p>
                        </div>

                        <div className="mx-auto max-w-3xl space-y-8">
                            {SELF_HOST_FAQ.map((item, index) => (
                                <div
                                    key={item.question}
                                    className="border-t-2 border-[#0f5c52]/25 pt-4"
                                >
                                    <h3 className="mb-2 text-base font-semibold tracking-tight text-[#0b1f1c]">
                                        <span className="mr-2 font-mono text-[11px] text-[#0f5c52]">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        {item.question}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-[#4a635c] sm:text-[0.95rem]">
                                        {item.answer}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="relative bg-[#0f5c52] py-14 md:py-24">
                    <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
                        <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
                            Ready to run verification yourself?
                        </h2>
                        <p className="mb-8 text-sm text-white/75 sm:text-base">
                            Pick a licence, deploy with Docker, and keep list processing on your stack.
                        </p>
                        <div className="flex flex-col justify-center gap-3 sm:flex-row">
                            <a
                                href={SELF_HOST_PURCHASE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#0b1f1c]/25 bg-white px-6 py-3 text-sm font-semibold text-[#0b1f1c] transition-colors hover:bg-[#e8f2ef]"
                            >
                                Buy on Gumroad
                            </a>
                            <a
                                href="#pricing"
                                className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/50 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
                            >
                                Compare licences
                            </a>
                        </div>
                    </div>
                </section>
            </main>
        </PublicSiteShell>
    )
}
