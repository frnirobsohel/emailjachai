"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/common/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/common/card"
import { Check, Loader2, CreditCard, Bitcoin, X, ExternalLink } from "lucide-react"
import { CreditBadge } from "@/app/(dashboard)/_components/credit-badge"
import { ApiClient } from "@/lib/api-client"

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

export function BuyCreditsClient({ initialPackages, initialSettings }: BuyCreditsProps) {
    const [packages, setPackages] = useState<Package[]>(initialPackages)
    const [isLoading, setIsLoading] = useState(false)
    const [cryptomusEnabled, setCryptomusEnabled] = useState(initialSettings.cryptomusEnabled)
    const [stripeEnabled, setStripeEnabled] = useState(initialSettings.stripeEnabled)
    const [paypalEnabled, setPaypalEnabled] = useState(initialSettings.paypalEnabled)

    // Payment modal state
    const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
    const [paying, setPaying] = useState<'standard' | 'crypto' | 'stripe' | 'paypal' | null>(null)

    const fetchPackages = async () => {
        try {
            const data = await ApiClient.get('/packages/list');
            if (data.status === 'success') {
                setPackages((data.data as Package[]).filter((p: Package) => p.status === 'active'));
            }
        } catch (error) {
            console.error("Failed to fetch packages:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const fetchSettings = async () => {
        try {
            const data = await ApiClient.get('/settings/public')
            if (data.status === 'success' && data.data) {
                const raw = data.data as Record<string, string>
                setCryptomusEnabled(raw['cryptomus_enabled'] === '1')
                setStripeEnabled(raw['stripe_enabled'] === '1')
                setPaypalEnabled(raw['paypal_enabled'] === '1')
            }
        } catch (e) {
            console.error("Failed to fetch settings:", e);
        }
    }

    useEffect(() => {
        // If data isn't provided via props, fetch it (fallback)
        if (!initialPackages || initialPackages.length === 0) {
            fetchPackages();
            fetchSettings();
        }
    }, [initialPackages]);


    const handleCryptoPurchase = async () => {
        if (!selectedPkg || paying) return;
        setPaying('crypto');
        try {
            const data = await ApiClient.post('/payment/cryptomus/create', { package_id: selectedPkg.id });
            const invoiceData = data.data as { payment_url?: string } | null;
            if (data.status === 'success' && invoiceData?.payment_url) {
                window.open(invoiceData.payment_url, '_blank');
                setSelectedPkg(null);
                alert("Crypto checkout opened in a new tab.\nYour credits will be added automatically after payment is confirmed.");
            } else {
                alert(data.message || "Failed to create crypto invoice.");
            }
        } catch (error) {
            console.error("Crypto payment error:", error);
            alert("An error occurred while creating the crypto invoice.");
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
                alert(data.message || "Failed to create Stripe session.");
            }
        } catch (error) {
            console.error("Stripe payment error:", error);
            alert("An error occurred while initiating Stripe payment.");
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
                alert(data.message || "Failed to create PayPal order.");
            }
        } catch (error) {
            console.error("PayPal payment error:", error);
            alert("An error occurred while initiating PayPal payment.");
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
                <h2 className="text-3xl font-bold tracking-tight">Buy Credits</h2>
                <CreditBadge />
            </div>

            <p className="text-slate-500 max-w-2xl">
                Purchase credits to verify more emails. Credits depend on the plan you choose.
            </p>

            <div className="grid gap-6 md:grid-cols-3 mt-8">
                {packages.map((plan) => (
                    <Card key={plan.id} className={`flex flex-col shadow-sm border-indigo-100 overflow-hidden ${plan.popular ? 'ring-2 ring-indigo-500 relative' : ''}`}>
                        {plan.popular && (
                            <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 uppercase tracking-wider rounded-bl-lg">
                                Most Popular
                            </div>
                        )}
                        <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                            <CardTitle className="text-lg font-semibold text-slate-900">{plan.name}</CardTitle>
                            <CardDescription>{plan.tagline || "Perfect for growing businesses"}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 pt-6">
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-3xl font-bold">${parseFloat(plan.price).toFixed(0)}</span>
                                <span className="text-slate-500 text-sm">/one-time</span>
                            </div>
                            <div className="text-sm font-semibold text-indigo-600 mb-6 bg-indigo-50 inline-block px-2 py-0.5 rounded">
                                {parseInt(plan.credits_amount.toString()).toLocaleString()} Credits
                            </div>
                            <ul className="space-y-3 text-sm">
                                {getFeatureList(plan.features).map((feature: string, idx: number) => (
                                    <li key={idx} className="flex items-start">
                                        <Check className="mr-2 h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                        <span className="text-slate-600">{feature}</span>
                                    </li>
                                ))}
                                {getFeatureList(plan.features).length === 0 && (
                                    <>
                                        <li className="flex items-start">
                                            <Check className="mr-2 h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                            <span className="text-slate-600">Email Verification</span>
                                        </li>
                                        <li className="flex items-start">
                                            <Check className="mr-2 h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                            <span className="text-slate-600">Bulk Upload & API Access</span>
                                        </li>
                                    </>
                                )}
                            </ul>
                        </CardContent>
                        <CardFooter className="pt-6 border-t border-slate-50 bg-slate-50/30">
                            <Button
                                className={`w-full ${plan.popular ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-[#0f172b] hover:bg-[#0f172b]/90'} text-white shadow-sm`}
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
                    <Card className="md:col-span-3">
                        <CardContent className="py-10 text-center text-slate-500">
                            No active packages are available right now.
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Payment method modal */}
            {selectedPkg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 relative">
                        {/* Close */}
                        <button
                            onClick={() => { if (!paying) setSelectedPkg(null) }}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Choose Payment Method</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Purchasing <span className="font-semibold text-indigo-600">{selectedPkg.name}</span> —{' '}
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
                                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                                            Pay with Card (Stripe)
                                        </p>
                                        <p className="text-xs text-slate-500">Secure checkout via Stripe</p>
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
                                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                                            Pay with PayPal
                                        </p>
                                        <p className="text-xs text-slate-500">Fast and secure payment via PayPal</p>
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
                                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                                            Pay with Crypto
                                            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                                        </p>
                                        <p className="text-xs text-slate-500">Powered by Cryptomus · USDT, BTC, ETH & more</p>
                                    </div>
                                    <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full uppercase tracking-wide">Crypto</span>
                                </button>
                            )}
                        </div>

                        <p className="text-[11px] text-slate-400 text-center">
                            Credits are added to your account immediately after payment confirmation.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
