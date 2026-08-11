"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Loader2, CreditCard, Bitcoin, X, ExternalLink } from "lucide-react"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
import { ApiClient } from "@/lib/api-client"
import { toast } from "react-hot-toast"
import { useConfigStore } from "@/stores/config-store"
import {
    packageChargePrice,
    packageDiscountPercent,
    packageHasOffer,
} from "@/lib/package-pricing"

export interface Package {
    id: number;
    name: string;
    tagline: string;
    credits_amount: number;
    price: string;
    offer_price?: string | number;
    features: string[] | string;
    popular: boolean;
    status: string;
}

interface BuyCreditsProps {
    initialPackages: Package[];
    initialSettings: {
        cryptomusEnabled: boolean;
        stripeEnabled: boolean;
        paypalEnabled: boolean;
    };
}

function extractCheckoutURL(data: unknown): string | null {
    if (!data || typeof data !== "object") return null
    const d = data as Record<string, unknown>
    for (const key of ["checkout_url", "approval_url", "payment_url"] as const) {
        const v = d[key]
        if (typeof v === "string" && v.length > 0) return v
    }
    return null
}

export function BuyCreditsClient({ initialPackages, initialSettings }: BuyCreditsProps) {
    const packagesFromStore = useConfigStore((s) => s.packages)
    const settingsFromStore = useConfigStore((s) => s.settings)
    const isLoadingPackages = useConfigStore((s) => s.isLoadingPackages)
    const isLoadingSettings = useConfigStore((s) => s.isLoadingSettings)
    const returnHandled = useRef(false)

    useEffect(() => {
        const store = useConfigStore.getState()
        if (!store.packages) {
            store.setPackages(initialPackages)
        }
        if (!store.settings) {
            store.setSettings({
                cryptomus_enabled: initialSettings.cryptomusEnabled ? "1" : "0",
                stripe_enabled: initialSettings.stripeEnabled ? "1" : "0",
                paypal_enabled: initialSettings.paypalEnabled ? "1" : "0",
            })
        }

        const next = useConfigStore.getState()
        if (!next.packages || next.packages.length === 0) {
            void next.fetchPackages()
        }
        if (!next.settings) {
            void next.fetchSettings()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only seed + cache-aware fetch
    }, [])

    // Post-checkout return UX (Stripe / PayPal / Cryptomus)
    useEffect(() => {
        if (returnHandled.current || typeof window === "undefined") return
        const params = new URLSearchParams(window.location.search)
        const status = params.get("status")
        if (!status) return
        returnHandled.current = true

        const clearParams = () => {
            window.history.replaceState({}, "", "/dashboard/credits")
        }

        if (status === "cancelled") {
            const txid = params.get("txid")
            if (txid) {
                void ApiClient.post("/payment/cancel", { transaction_id: txid }).catch(() => {
                    // Best-effort; background expiry still cleans abandoned rows.
                })
            }
            toast.error("Payment was cancelled.")
            clearParams()
            return
        }

        if (status === "success") {
            const provider = params.get("provider")
            const paypalToken = params.get("token")

            if (provider === "paypal" && paypalToken) {
                const toastId = toast.loading("Confirming PayPal payment…")
                void ApiClient.post("/payment/paypal/capture", { order_id: paypalToken })
                    .then((data) => {
                        if (data.status === "success") {
                            toast.success("Payment confirmed! Credits have been added.", { id: toastId })
                        } else {
                            toast.success("Payment received. Credits will appear shortly after confirmation.", { id: toastId })
                        }
                    })
                    .catch(() => {
                        toast.success("Payment submitted. Credits will appear shortly after confirmation.", { id: toastId })
                    })
                    .finally(clearParams)
                return
            }

            toast.success("Payment successful! Credits will appear on your balance shortly.")
            clearParams()
        }
    }, [])

    const packages = packagesFromStore || initialPackages
    const cryptomusEnabled = settingsFromStore
        ? settingsFromStore.cryptomus_enabled === "1"
        : initialSettings.cryptomusEnabled
    const stripeEnabled = settingsFromStore
        ? settingsFromStore.stripe_enabled === "1"
        : initialSettings.stripeEnabled
    const paypalEnabled = settingsFromStore
        ? settingsFromStore.paypal_enabled === "1"
        : initialSettings.paypalEnabled

    const isLoading = isLoadingPackages || isLoadingSettings

    const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
    const [paying, setPaying] = useState<"crypto" | "stripe" | "paypal" | null>(null)

    const handleCryptoPurchase = async () => {
        if (!selectedPkg || paying) return
        setPaying("crypto")
        try {
            const data = await ApiClient.post("/payment/cryptomus/create", { package_id: selectedPkg.id })
            const url = extractCheckoutURL(data.data)
            if (data.status === "success" && url) {
                window.open(url, "_blank")
                setSelectedPkg(null)
                toast.success("Crypto checkout opened in a new tab. Credits are added after payment is confirmed.", { duration: 5000 })
            } else {
                toast.error(data.message || "Failed to create crypto invoice.")
            }
        } catch (error) {
            console.error("Crypto payment error:", error)
            toast.error("An error occurred while creating the crypto invoice.")
        } finally {
            setPaying(null)
        }
    }

    const handleStripePurchase = async () => {
        if (!selectedPkg || paying) return
        setPaying("stripe")
        try {
            const data = await ApiClient.post("/payment/stripe/create", { package_id: selectedPkg.id })
            const url = extractCheckoutURL(data.data)
            if (data.status === "success" && url) {
                window.location.href = url
            } else {
                toast.error(data.message || "Failed to create Stripe session.")
                setPaying(null)
            }
        } catch (error) {
            console.error("Stripe payment error:", error)
            toast.error("An error occurred while initiating Stripe payment.")
            setPaying(null)
        }
    }

    const handlePaypalPurchase = async () => {
        if (!selectedPkg || paying) return
        setPaying("paypal")
        try {
            const data = await ApiClient.post("/payment/paypal/create", { package_id: selectedPkg.id })
            const url = extractCheckoutURL(data.data)
            if (data.status === "success" && url) {
                window.location.href = url
            } else {
                toast.error(data.message || "Failed to create PayPal order.")
                setPaying(null)
            }
        } catch (error) {
            console.error("PayPal payment error:", error)
            toast.error("An error occurred while initiating PayPal payment.")
            setPaying(null)
        }
    }

    const getFeatureList = (features: Package["features"]): string[] => {
        if (Array.isArray(features)) return features
        if (typeof features === "string") {
            try {
                const parsed = JSON.parse(features) as unknown
                return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
            } catch {
                return []
            }
        }
        return []
    }

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Buy Credits</h2>
                    <p className="mt-1 text-sm text-[#5a736c] max-w-2xl">
                        Purchase credits to verify more emails. Credits depend on the plan you choose.
                    </p>
                </div>
                <CreditBadge />
            </div>

            <div className="grid gap-6 md:grid-cols-3 mt-8">
                {packages.map((plan) => {
                    const hasOffer = packageHasOffer(plan)
                    const charge = packageChargePrice(plan)
                    const discount = packageDiscountPercent(plan)
                    const isFree = charge === 0 || plan.name.toLowerCase().includes("free")

                    return (
                        <Card key={plan.id} className={`flex flex-col border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden ${plan.popular ? "ring-2 ring-[#0f5c52] relative" : ""}`}>
                            {plan.popular && (
                                <div className="absolute top-0 right-0 bg-[#0f5c52] text-white text-[10px] font-bold px-2 py-1 uppercase tracking-wider rounded-bl-lg">
                                    Most Popular
                                </div>
                            )}
                            <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                                <CardTitle className="text-lg font-semibold text-[#0b1f1c]">{plan.name}</CardTitle>
                                <CardDescription className="text-[#5a736c]">{plan.tagline || "Perfect for growing businesses"}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 pt-6">
                                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                                    <span className="text-3xl font-bold text-[#0b1f1c]">
                                        ${charge % 1 === 0 ? charge.toFixed(0) : charge.toFixed(2)}
                                    </span>
                                    {hasOffer && (
                                        <span className="text-sm text-[#6b857c] line-through">
                                            ${Number(plan.price).toFixed(Number(plan.price) % 1 === 0 ? 0 : 2)}
                                        </span>
                                    )}
                                    {hasOffer && discount !== null && (
                                        <span className="text-xs font-semibold text-[#0f5c52]">{discount}% off</span>
                                    )}
                                    <span className="text-[#5a736c] text-sm">/one-time</span>
                                </div>
                                <div className="text-sm font-semibold text-[#0f5c52] mb-6 bg-[#0f5c52]/10 inline-block px-2 py-0.5 rounded">
                                    {parseInt(plan.credits_amount.toString()).toLocaleString()} Credits
                                </div>
                                <ul className="space-y-3 text-sm">
                                    {getFeatureList(plan.features).map((feature: string, idx: number) => (
                                        <li key={idx} className="flex items-start">
                                            <Check className="mr-2 h-4 w-4 text-[#0f5c52] shrink-0 mt-0.5" />
                                            <span className="text-[#5a736c]">{feature}</span>
                                        </li>
                                    ))}
                                    {getFeatureList(plan.features).length === 0 && (
                                        <>
                                            <li className="flex items-start">
                                                <Check className="mr-2 h-4 w-4 text-[#0f5c52] shrink-0 mt-0.5" />
                                                <span className="text-[#5a736c]">Email Verification</span>
                                            </li>
                                            <li className="flex items-start">
                                                <Check className="mr-2 h-4 w-4 text-[#0f5c52] shrink-0 mt-0.5" />
                                                <span className="text-[#5a736c]">Bulk Upload & API Access</span>
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </CardContent>
                            <CardFooter className="pt-6 border-t border-[#0b1f1c]/8 bg-[#f0f4f2]/30">
                                {isFree ? (
                                    <Button
                                        variant="outline"
                                        className="w-full border-[#0f5c52]/30 bg-[#0f5c52]/5 hover:bg-[#0f5c52]/10 text-[#0f5c52] shadow-none font-medium text-xs sm:text-sm"
                                        onClick={() => {
                                            toast("Included on Account Signup Already", {
                                                icon: "ℹ️",
                                                duration: 4000,
                                            })
                                        }}
                                    >
                                        <Check className="mr-1.5 h-4 w-4 text-[#0f5c52]" />
                                        Included on Account Signup Already
                                    </Button>
                                ) : (
                                    <Button
                                        className="w-full border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none"
                                        onClick={() => setSelectedPkg(plan)}
                                        disabled={selectedPkg !== null}
                                    >
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Purchase Credits
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    )
                })}
                {!isLoading && packages.length === 0 && (
                    <Card className="md:col-span-3 border-[#0b1f1c]/10 bg-white/90 shadow-none">
                        <CardContent className="py-10 text-center text-[#5a736c]">
                            No active packages are available right now.
                        </CardContent>
                    </Card>
                )}
            </div>

            {selectedPkg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-md p-6 space-y-5 relative">
                        <button
                            onClick={() => { if (!paying) setSelectedPkg(null) }}
                            className="absolute top-4 right-4 text-[#5a736c] hover:text-[#0f5c52] transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div>
                            <h3 className="text-lg font-bold text-[#0b1f1c]">Choose Payment Method</h3>
                            <p className="text-sm text-[#5a736c] mt-1">
                                Purchasing <span className="font-semibold text-[#0f5c52]">{selectedPkg.name}</span> —{" "}
                                <span className="font-semibold">
                                    ${packageChargePrice(selectedPkg).toFixed(2)}
                                </span>
                                {packageHasOffer(selectedPkg) && (
                                    <span className="ml-1 text-[#6b857c] line-through">
                                        ${Number(selectedPkg.price).toFixed(2)}
                                    </span>
                                )}{" "}
                                for{" "}
                                <span className="font-semibold">{parseInt(selectedPkg.credits_amount.toString()).toLocaleString()} credits</span>
                            </p>
                        </div>

                        <div className="space-y-3">
                            {stripeEnabled && (
                                <button
                                    onClick={handleStripePurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-indigo-100 rounded-lg">
                                        {paying === "stripe" ? (
                                            <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                                        ) : (
                                            <CreditCard className="h-5 w-5 text-indigo-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-[#0b1f1c]">Pay with Card (Stripe)</p>
                                        <p className="text-xs text-[#5a736c]">Secure checkout via Stripe</p>
                                    </div>
                                </button>
                            )}

                            {paypalEnabled && (
                                <button
                                    onClick={handlePaypalPurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-blue-100 rounded-lg">
                                        {paying === "paypal" ? (
                                            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                                        ) : (
                                            <CreditCard className="h-5 w-5 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-[#0b1f1c]">Pay with PayPal</p>
                                        <p className="text-xs text-[#5a736c]">Fast and secure payment via PayPal</p>
                                    </div>
                                </button>
                            )}

                            {cryptomusEnabled && (
                                <button
                                    onClick={handleCryptoPurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-orange-100 hover:border-orange-300 hover:bg-orange-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-orange-100 rounded-lg">
                                        {paying === "crypto" ? (
                                            <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
                                        ) : (
                                            <Bitcoin className="h-5 w-5 text-orange-500" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-[#0b1f1c] flex items-center gap-1.5">
                                            Pay with Crypto
                                            <ExternalLink className="h-3.5 w-3.5 text-[#5a736c]" />
                                        </p>
                                        <p className="text-xs text-[#5a736c]">Powered by Cryptomus · USDT, BTC, ETH & more</p>
                                    </div>
                                    <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full uppercase tracking-wide">Crypto</span>
                                </button>
                            )}

                            {!stripeEnabled && !paypalEnabled && !cryptomusEnabled && (
                                <p className="text-sm text-center text-[#5a736c] py-4">
                                    No payment methods are enabled right now. Please contact support.
                                </p>
                            )}
                        </div>

                        <p className="text-[11px] text-[#5a736c] text-center">
                            Credits are added to your account immediately after payment confirmation.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
