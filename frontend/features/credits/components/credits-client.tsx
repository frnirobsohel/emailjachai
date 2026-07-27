"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Loader2, CreditCard, Bitcoin, X, ExternalLink } from "lucide-react"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
import { ApiClient } from "@/lib/api-client"
import { toast } from "react-hot-toast"

export interface Package {
    id: number;
    name: string;
    tagline: string;
    credits_amount: number;
    price: string;
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

import { useConfigStore } from "@/stores/config-store"

export function BuyCreditsClient({ initialPackages, initialSettings }: BuyCreditsProps) {
    const packagesFromStore = useConfigStore((s) => s.packages)
    const settingsFromStore = useConfigStore((s) => s.settings)
    const isLoadingPackages = useConfigStore((s) => s.isLoadingPackages)
    const isLoadingSettings = useConfigStore((s) => s.isLoadingSettings)

    // Seed from SSR once, then refresh only if store cache is empty
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
        // Only network-fetch when cache is still empty (avoids rate-limit loops)
        if (!next.packages || next.packages.length === 0) {
            void next.fetchPackages()
        }
        if (!next.settings) {
            void next.fetchSettings()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only seed + cache-aware fetch
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

    // Payment modal state
    const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
    const [paying, setPaying] = useState<'standard' | 'crypto' | 'stripe' | 'paypal' | null>(null)


    const handleCryptoPurchase = async () => {
        if (!selectedPkg || paying) return;
        setPaying('crypto');
        try {
            const data = await ApiClient.post('/payment/cryptomus/create', { package_id: selectedPkg.id });
            const invoiceData = data.data as { payment_url?: string } | null;
            if (data.status === 'success' && invoiceData?.payment_url) {
                window.open(invoiceData.payment_url, '_blank');
                setSelectedPkg(null);
                toast.success("Crypto checkout opened in a new tab. Your credits will be added automatically after payment is confirmed.", { duration: 5000 });
            } else {
                toast.error(data.message || "Failed to create crypto invoice.");
            }
        } catch (error) {
            console.error("Crypto payment error:", error);
            toast.error("An error occurred while creating the crypto invoice.");
        } finally {
            setPaying(null);
        }
    }

    const handleStripePurchase = async () => {
        if (!selectedPkg || paying) return;
        setPaying('stripe');
        try {
            const data = await ApiClient.post('/payment/stripe/create', { package_id: selectedPkg.id });
            const sessionData = data.data as { checkout_url?: string } | null;
            if (data.status === 'success' && sessionData?.checkout_url) {
                window.location.href = sessionData.checkout_url;
            } else {
                toast.error(data.message || "Failed to create Stripe session.");
            }
        } catch (error) {
            console.error("Stripe payment error:", error);
            toast.error("An error occurred while initiating Stripe payment.");
        } finally {
            setPaying(null);
        }
    }

    const handlePaypalPurchase = async () => {
        if (!selectedPkg || paying) return;
        setPaying('paypal');
        try {
            const data = await ApiClient.post('/payment/paypal/create', { package_id: selectedPkg.id });
            const orderData = data.data as { approval_url?: string } | null;
            if (data.status === 'success' && orderData?.approval_url) {
                window.location.href = orderData.approval_url;
            } else {
                toast.error(data.message || "Failed to create PayPal order.");
            }
        } catch (error) {
            console.error("PayPal payment error:", error);
            toast.error("An error occurred while initiating PayPal payment.");
        } finally {
            setPaying(null);
        }
    }

    const getFeatureList = (features: Package["features"]): string[] => {
        if (Array.isArray(features)) return features;
        if (typeof features === "string") {
            try {
                const parsed = JSON.parse(features) as unknown;
                return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
            } catch {
                return [];
            }
        }
        return [];
    };

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
                {packages.map((plan) => (
                    <Card key={plan.id} className={`flex flex-col border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden ${plan.popular ? 'ring-2 ring-[#0f5c52] relative' : ''}`}>
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
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-3xl font-bold text-[#0b1f1c]">${parseFloat(plan.price).toFixed(0)}</span>
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
                            <Button
                                className="w-full border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none"
                                onClick={() => setSelectedPkg(plan)}
                                disabled={selectedPkg !== null}
                            >
                                <CreditCard className="mr-2 h-4 w-4" />
                                Purchase Credits
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
                {!isLoading && packages.length === 0 && (
                    <Card className="md:col-span-3 border-[#0b1f1c]/10 bg-white/90 shadow-none">
                        <CardContent className="py-10 text-center text-[#5a736c]">
                            No active packages are available right now.
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Payment method modal */}
            {selectedPkg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-[#0b1f1c]/10 w-full max-w-md p-6 space-y-5 relative">
                        {/* Close */}
                        <button
                            onClick={() => { if (!paying) setSelectedPkg(null) }}
                            className="absolute top-4 right-4 text-[#5a736c] hover:text-[#0f5c52] transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div>
                            <h3 className="text-lg font-bold text-[#0b1f1c]">Choose Payment Method</h3>
                            <p className="text-sm text-[#5a736c] mt-1">
                                Purchasing <span className="font-semibold text-[#0f5c52]">{selectedPkg.name}</span> —{' '}
                                <span className="font-semibold">${parseFloat(selectedPkg.price).toFixed(2)}</span> for{' '}
                                <span className="font-semibold">{parseInt(selectedPkg.credits_amount.toString()).toLocaleString()} credits</span>
                            </p>
                        </div>

                        <div className="space-y-3">

                            {/* Stripe — only shown if enabled */}
                            {stripeEnabled && (
                                <button
                                    onClick={handleStripePurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-indigo-100 rounded-lg">
                                        {paying === 'stripe' ? (
                                            <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                                        ) : (
                                            <CreditCard className="h-5 w-5 text-indigo-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-[#0b1f1c] flex items-center gap-1.5">
                                            Pay with Card (Stripe)
                                        </p>
                                        <p className="text-xs text-[#5a736c]">Secure checkout via Stripe</p>
                                    </div>
                                </button>
                            )}

                            {/* PayPal — only shown if enabled */}
                            {paypalEnabled && (
                                <button
                                    onClick={handlePaypalPurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-blue-100 rounded-lg">
                                        {paying === 'paypal' ? (
                                            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                                        ) : (
                                            <CreditCard className="h-5 w-5 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-[#0b1f1c] flex items-center gap-1.5">
                                            Pay with PayPal
                                        </p>
                                        <p className="text-xs text-[#5a736c]">Fast and secure payment via PayPal</p>
                                    </div>
                                </button>
                            )}

                            {/* Cryptomus — only shown if enabled */}
                            {cryptomusEnabled && (
                                <button
                                    onClick={handleCryptoPurchase}
                                    disabled={paying !== null}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-orange-100 hover:border-orange-300 hover:bg-orange-50/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                >
                                    <div className="p-2.5 bg-orange-100 rounded-lg">
                                        {paying === 'crypto' ? (
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
