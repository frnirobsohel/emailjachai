import { HomeEmailVerifier } from "@/components/home/home-email-verifier"

interface HeroProps {
    siteTagline: string
}

export function Hero({ siteTagline }: HeroProps) {
    return (
        <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-r from-indigo-500/20 via-purple-500/15 to-pink-500/10 rounded-full blur-[120px]" />
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Enterprise-Grade Email Verification
                </div>

                {/* Title */}
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 text-slate-200">
                    {siteTagline}
                </h1>

                {/* Subtitle */}
                <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                    Clean your email lists, improve deliverability, and protect your sender reputation with real-time SMTP verification.
                </p>

                {/* Email Verify Input */}
                <div className="mt-8">
                    <HomeEmailVerifier />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-6 mt-16 max-w-lg mx-auto">
                    <div>
                        <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">99.2%</div>
                        <div className="text-xs text-slate-500 mt-1">Accuracy Rate</div>
                    </div>
                    <div>
                        <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">50M+</div>
                        <div className="text-xs text-slate-500 mt-1">Emails Verified</div>
                    </div>
                    <div>
                        <div className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">500ms</div>
                        <div className="text-xs text-slate-500 mt-1">Avg Response</div>
                    </div>
                </div>
            </div>
        </section>
    )
}
