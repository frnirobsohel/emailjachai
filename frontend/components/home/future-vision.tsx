const visionItems = [
    {
        title: "Low Cost, Always",
        body: "Pricing stays tied to real infrastructure, maintenance, and continuous improvement—not profit maximization. Best value for every user, for the long term.",
    },
    {
        title: "High Accuracy",
        body: "Accuracy is our highest priority. We keep researching, testing, and refining the verification engine so results stay reliable as the email landscape changes.",
    },
    {
        title: "Self-Hosted Solution",
        body: "Own your infrastructure. Buy once, get lifetime updates, deploy on your own server, and run unlimited verification—with no recurring subscription fees.",
    },
    {
        title: "Community-Driven Innovation",
        body: "Feature requests and ideas from our users shape the roadmap. The most requested, highest-value proposals get prioritized in future updates.",
    },
    {
        title: "Open to Collaboration",
        body: "Have an idea? Bring it to us. We work directly with users, businesses, and developers—turning your concept into a real feature or custom solution, built around what you need.",
    },
]

export function FutureVision() {
    return (
        <section id="vision" className="relative bg-[var(--surface,#f7faf8)] py-16 md:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0b1f1c]/10 bg-white/60 px-3 py-1 text-xs font-medium text-[#3d564f]">
                        Vision
                    </div>
                    <h2 className="mb-3 text-[1.65rem] font-semibold tracking-[-0.02em] text-[var(--ink,#0b1f1c)] sm:text-[1.85rem] md:mb-4 md:text-[2.25rem]">
                        Our Future Vision
                    </h2>
                    <p className="text-sm leading-relaxed text-[var(--muted,#4a635c)] sm:text-base md:text-[1.05rem]">
                        The principles that guide how we build, price, and grow the platform with our users.
                    </p>
                </div>

                <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-12">
                    {visionItems.map((item, i) => (
                        <div
                            key={item.title}
                            className="border-t-2 border-[var(--accent,#0f5c52)]/35 pt-5"
                        >
                            <p className="mb-3 font-mono text-[11px] tracking-wider text-[var(--accent,#0f5c52)]">
                                {String(i + 1).padStart(2, "0")}
                            </p>
                            <h3 className="mb-2.5 text-base font-semibold tracking-tight text-[var(--ink,#0b1f1c)] sm:text-lg">
                                {item.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-[var(--muted,#4a635c)]">
                                {item.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
