import Link from "next/link"
import { BrandLogo } from "@/components/home/brand-logo"
import { Footer } from "@/components/home/footer"

interface LegalSection {
    title: string
    paragraphs: string[]
}

interface LegalDocumentProps {
    siteTitle: string
    logoUrl: string
    twitterUrl?: string
    linkedinUrl?: string
    githubUrl?: string
    title: string
    updatedAt: string
    intro: string
    sections: LegalSection[]
}

export function LegalDocument({
    siteTitle,
    logoUrl,
    twitterUrl,
    linkedinUrl,
    githubUrl,
    title,
    updatedAt,
    intro,
    sections,
}: LegalDocumentProps) {
    return (
        <div className="flex min-h-screen flex-col bg-[#f0f4f2] text-[#0b1f1c]">
            <header className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/90 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
                    <Link
                        href="/"
                        className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-[#0b1f1c] sm:gap-2.5 sm:text-base"
                    >
                        <BrandLogo logoUrl={logoUrl} siteTitle={siteTitle} size={28} className="h-7 w-7 object-contain" />
                        <span className="truncate">{siteTitle}</span>
                    </Link>
                    <Link
                        href="/"
                        className="text-sm text-[#4a635c] transition-colors hover:text-[#0b1f1c]"
                    >
                        Back to home
                    </Link>
                </div>
            </header>

            <main className="flex-1 px-4 py-12 sm:px-6 md:py-16">
                <article className="mx-auto max-w-3xl">
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-[#0f5c52]">
                        Legal
                    </p>
                    <h1 className="mb-3 text-[1.85rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-4xl">
                        {title}
                    </h1>
                    <p className="mb-8 text-sm text-[#6b857c]">
                        Last updated: {updatedAt}
                    </p>
                    <p className="mb-10 text-sm leading-relaxed text-[#4a635c] sm:text-base">
                        {intro}
                    </p>

                    <div className="space-y-10">
                        {sections.map((section, index) => (
                            <section key={section.title}>
                                <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#0b1f1c]">
                                    <span className="mr-2 font-mono text-[11px] text-[#0f5c52]">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    {section.title}
                                </h2>
                                <div className="space-y-3 border-t-2 border-[#0f5c52]/25 pt-4">
                                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                                        <p
                                            key={`${section.title}-${paragraphIndex}`}
                                            className="text-sm leading-relaxed text-[#4a635c] sm:text-[0.95rem]"
                                        >
                                            {paragraph}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </article>
            </main>

            <Footer
                siteTitle={siteTitle}
                logoUrl={logoUrl}
                twitterUrl={twitterUrl}
                linkedinUrl={linkedinUrl}
                githubUrl={githubUrl}
            />
        </div>
    )
}
