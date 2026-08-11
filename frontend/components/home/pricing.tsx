import Link from "next/link"
import {
    packageChargePrice,
    packageDiscountPercent,
    packageHasOffer,
} from "@/lib/package-pricing"

export type PackageRow = {
    id: number
    name: string
    tagline: string
    price: number
    offer_price?: number
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
        <section id="pricing" className="relative bg-white py-16 md:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
                <div className="mx-auto mb-10 max-w-xl text-center md:mb-14">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0b1f1c]/10 bg-[#f7faf8] px-3 py-1 text-xs font-medium text-[#3d564f]">
                        Pricing
                    </div>
                    <h2 className="mb-3 text-[1.65rem] font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl md:text-4xl">
                        Pay Only for What You Use
                    </h2>
                    <p className="text-sm leading-relaxed text-[#4a635c] sm:text-base">
                        No monthly fees, no hidden charges. Buy credits and verify emails at your own pace.
                    </p>
                </div>

                <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
                    {packages.map((pkg) => {
                        const hasOffer = packageHasOffer(pkg)
                        const charge = packageChargePrice(pkg)
                        const discount = packageDiscountPercent(pkg)

                        return (
                            <div
                                key={pkg.id}
                                className={`flex flex-col border p-5 sm:p-7 ${
                                    pkg.popular
                                        ? "border-[#0f5c52] bg-[#f0f7f5]"
                                        : "border-[#0b1f1c]/10 bg-[#fafbfa]"
                                }`}
                            >
                                <div className="mb-6">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <h3 className="text-base font-semibold text-[#0b1f1c]">{pkg.name}</h3>
                                        <div className="flex items-center gap-2">
                                            {hasOffer && discount !== null && (
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0f5c52]">
                                                    {discount}% off
                                                </span>
                                            )}
                                            {pkg.popular && (
                                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0f5c52]">
                                                    Popular
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {pkg.tagline?.trim() ? (
                                        <p className="mt-2.5 text-sm text-[#5a736c]">{pkg.tagline.trim()}</p>
                                    ) : null}
                                </div>
                                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                                    <span className="text-4xl font-semibold tracking-tight text-[#0b1f1c]">
                                        ${charge % 1 === 0 ? charge.toFixed(0) : charge.toFixed(2)}
                                    </span>
                                    {hasOffer && (
                                        <span className="text-base text-[#6b857c] line-through">
                                            ${Number(pkg.price) % 1 === 0
                                                ? Number(pkg.price).toFixed(0)
                                                : Number(pkg.price).toFixed(2)}
                                        </span>
                                    )}
                                </div>
                                <p className="mb-8 text-sm text-[#5a736c]">
                                    {pkg.credits_amount.toLocaleString()} credits
                                </p>

                                <ul className="mb-8 flex-1 space-y-3">
                                    {pkg.features?.map((feature, idx) => (
                                        <li
                                            key={idx}
                                            className="flex gap-2 text-sm text-[#3d564f]"
                                        >
                                            <span className="mt-1.5 h-1 w-1 shrink-0 bg-[#0f5c52]" aria-hidden />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href="/register"
                                    className={`block w-full rounded-md border py-2.5 text-center text-sm font-semibold transition-colors ${
                                        pkg.popular
                                            ? "border-[#08352f] bg-[#0f5c52] text-white hover:bg-[#0b4a42]"
                                            : "border-[#0b1f1c]/25 bg-white text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                                    }`}
                                >
                                    Get Started
                                </Link>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
