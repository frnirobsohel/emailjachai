const features = [
    {
        title: "Syntax Check",
        body: "Validates email format against RFC 5322 standards to catch typos and invalid patterns instantly.",
    },
    {
        title: "MX Record Lookup",
        body: "Checks if the domain has valid mail exchange records configured and resolves DNS properly.",
    },
    {
        title: "SMTP Verification",
        body: "Connects to the mail server and verifies if the specific mailbox exists without sending an email.",
    },
    {
        title: "Risk Detection",
        body: "Identifies disposable emails, spam traps, role-based accounts, catch-all domains, and blacklisted addresses.",
    },
    {
        title: "Bulk Processing",
        body: "Upload CSV files with millions of emails and verify them all at blazing speed with parallel workers.",
    },
    {
        title: "REST API Access",
        body: "Integrate email verification into your app with our developer-friendly API. Full documentation included.",
    },
]

export function Features() {
    return (
        <section id="features" className="relative bg-[var(--surface,#f7faf8)] py-16 md:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0b1f1c]/10 bg-white/60 px-3 py-1 text-xs font-medium text-[#3d564f]">
                        Features
                    </div>
                    <h2 className="mb-3 text-[1.65rem] font-semibold tracking-[-0.02em] text-[var(--ink,#0b1f1c)] sm:text-[1.85rem] md:mb-4 md:text-[2.25rem]">
                        Multi-Layer Email Verification
                    </h2>
                    <p className="text-sm leading-relaxed text-[var(--muted,#4a635c)] sm:text-base md:text-[1.05rem]">
                        Our system runs multiple checks to ensure every email in your list is valid, safe, and deliverable.
                    </p>
                </div>

                <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-12">
                    {features.map((feature, i) => (
                        <div
                            key={feature.title}
                            className="border-t-2 border-[var(--accent,#0f5c52)]/35 pt-5"
                        >
                            <p className="mb-3 font-mono text-[11px] tracking-wider text-[var(--accent,#0f5c52)]">
                                0{i + 1}
                            </p>
                            <h3 className="mb-2.5 text-base font-semibold tracking-tight text-[var(--ink,#0b1f1c)] sm:text-lg">
                                {feature.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-[var(--muted,#4a635c)]">
                                {feature.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
