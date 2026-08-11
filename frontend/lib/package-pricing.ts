export interface PackagePricingInput {
    price: number | string
    offer_price?: number | string | null
}

function toMoney(value: number | string | null | undefined): number {
    const n = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.round(n * 100) / 100
}

/** True when offer_price is a live discount under regular price. */
export function packageHasOffer(pkg: PackagePricingInput): boolean {
    const regular = toMoney(pkg.price)
    const offer = toMoney(pkg.offer_price)
    return offer > 0 && offer < regular
}

/** Amount charged at checkout. */
export function packageChargePrice(pkg: PackagePricingInput): number {
    if (packageHasOffer(pkg)) {
        return toMoney(pkg.offer_price)
    }
    return toMoney(pkg.price)
}

/** Whole-number percent off, or null when no offer. */
export function packageDiscountPercent(pkg: PackagePricingInput): number | null {
    if (!packageHasOffer(pkg)) return null
    const regular = toMoney(pkg.price)
    const offer = toMoney(pkg.offer_price)
    return Math.round((1 - offer / regular) * 100)
}
