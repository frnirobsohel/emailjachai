import { describe, expect, it } from "vitest"
import {
    packageChargePrice,
    packageDiscountPercent,
    packageHasOffer,
} from "./package-pricing"

describe("package pricing helpers", () => {
    it("treats missing/zero offer as no discount", () => {
        expect(packageHasOffer({ price: 25 })).toBe(false)
        expect(packageHasOffer({ price: 25, offer_price: 0 })).toBe(false)
        expect(packageChargePrice({ price: 25, offer_price: 0 })).toBe(25)
        expect(packageDiscountPercent({ price: 25, offer_price: 0 })).toBeNull()
    })

    it("applies offer when below regular price", () => {
        const pkg = { price: 25, offer_price: 17.5 }
        expect(packageHasOffer(pkg)).toBe(true)
        expect(packageChargePrice(pkg)).toBe(17.5)
        expect(packageDiscountPercent(pkg)).toBe(30)
    })

    it("ignores offer that is not lower than regular", () => {
        expect(packageHasOffer({ price: 10, offer_price: 10 })).toBe(false)
        expect(packageChargePrice({ price: 10, offer_price: 12 })).toBe(10)
    })
})
