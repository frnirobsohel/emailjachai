import Link from "next/link"

export type PackageRow = {
    id: number
    name: string
    tagline: string
    price: number
    credits_amount: number
    features: string[]
    status: string
    popular: boolean
}

interface PricingProps {
    packages: PackageRow[]
}

export function Pricing({ packages }: PricingProps) {
    return (
        <section id="pricing" className="relative py-20 md:py-32 border-t border-white/5 bg-slate-900/20">
            <div className="relative z-10 mx-auto max-w-5xl px-6">
                <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-medium mb-6">
                        Pricing
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                        Pay Only for What You Use
                    </h2>
                    <p className="text-base text-slate-400 max-w-xl mx-auto">
                        No monthly fees, no hidden charges. Buy credits and verify emails at your own pace.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {packages.map(pkg => (
                        <div key={pkg.id} className={`relative p-8 rounded-2xl border transition-colors ${pkg.popular ? 'border-indigo-500/30 bg-indigo-500/[0.03]' : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03]'}`}>
                            {pkg.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-500 text-[10px] font-bold text-slate-200 tracking-wider uppercase">
                                    Most Popular
                                </div>
                            )}
                            <h3 className={`text-base font-medium mb-2 ${pkg.popular ? 'text-indigo-300' : 'text-slate-300'}`}>{pkg.name}</h3>
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-4xl font-bold text-slate-200">${pkg.price}</span>
                            </div>
                            <p className="text-sm text-slate-500 mb-8">{pkg.credits_amount.toLocaleString()} credits</p>
                            
                            <ul className="space-y-4 mb-8">
                                {pkg.features?.map((feature, idx) => (
                                    <li key={idx} className={`flex items-center gap-3 text-sm ${pkg.popular ? 'text-slate-300' : 'text-slate-400'}`}>
                                        <svg className="h-4 w-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            
                            <Link href="/register" className={`block w-full text-center py-2.5 rounded-xl text-sm font-medium transition-colors ${pkg.popular ? 'bg-indigo-600 hover:bg-indigo-500 text-slate-200' : 'border border-white/10 hover:bg-white/5 text-slate-200'}`}>
                                Get Started
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
