import { HomeEmailVerifier } from "@/components/home/home-email-verifier"

interface HeroProps {
    siteTagline: string
}

export function Hero({ siteTagline }: HeroProps) {
    return (
        <section className="landing-hero relative overflow-hidden pt-24 pb-14 sm:pb-16 md:pt-32 md:pb-24">
            <div className="absolute inset-0" aria-hidden>
                <div className="absolute inset-0 bg-[linear-gradient(165deg,#f5f8f6_0%,#eef3f1_48%,#e4ece9_100%)]" />
                <div className="landing-hero-wash absolute left-1/2 top-1/4 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[#1a6b5c]/12 blur-[120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(15,92,82,0.12),transparent_55%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(11,31,28,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(11,31,28,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
                <div className="landing-hero-copy">
                    <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--accent,#0f5c52)]/25 bg-[var(--accent,#0f5c52)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent,#0f5c52)] backdrop-blur-sm sm:mb-8 sm:px-4 sm:text-xs">
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent,#0f5c52)]" />
                        <span className="truncate">Enterprise-Grade Email Verification</span>
                    </div>
                    <h1 className="landing-brand mb-4 text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-[var(--ink,#0b1f1c)] sm:mb-5 sm:text-5xl md:text-6xl">
                        {siteTagline}
                    </h1>
                    <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-[var(--muted,#4a635c)] sm:mb-10 sm:text-base md:text-lg">
                        Clean your email lists, improve deliverability, and protect your sender reputation with real-time SMTP verification.
                    </p>
                </div>

                <div className="landing-hero-cta mx-auto mt-2 w-full max-w-xl">
                    <HomeEmailVerifier />
                </div>

                <div className="mx-auto mt-12 grid max-w-lg grid-cols-3 gap-3 sm:mt-16 sm:gap-6">
                    <div>
                        <div className="bg-gradient-to-r from-[#0f5c52] to-[#1a8a78] bg-clip-text text-xl font-bold text-transparent sm:text-2xl md:text-3xl">
                            99.2%
                        </div>
                        <div className="mt-1 text-[10px] text-[#6b857c] sm:text-xs">Accuracy Rate</div>
                    </div>
                    <div>
                        <div className="bg-gradient-to-r from-[#1a8a78] to-[#0b3d4a] bg-clip-text text-xl font-bold text-transparent sm:text-2xl md:text-3xl">
                            50M+
                        </div>
                        <div className="mt-1 text-[10px] text-[#6b857c] sm:text-xs">Emails Verified</div>
                    </div>
                    <div>
                        <div className="bg-gradient-to-r from-[#0b3d4a] to-[#0f5c52] bg-clip-text text-xl font-bold text-transparent sm:text-2xl md:text-3xl">
                            500ms
                        </div>
                        <div className="mt-1 text-[10px] text-[#6b857c] sm:text-xs">Avg Response</div>
                    </div>
                </div>
            </div>
        </section>
    )
}
