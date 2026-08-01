"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Shield, Save, AlertCircle, Bitcoin, Loader2, FlaskConical } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

export type GatewayProvider = "stripe" | "paypal" | "cryptomus"

export type GatewayView = {
    enabled: boolean
    test_mode: boolean
    public_key: string
    merchant_id?: string
    has_secret_key: boolean
    has_webhook_secret: boolean
    has_payment_key: boolean
}

export type PaymentSettingsView = {
    api_base_url: string
    webhook_urls: Record<string, string>
    gateways: Record<GatewayProvider, GatewayView>
}

const gatewaySchema = z.object({
    enabled: z.boolean(),
    testMode: z.boolean(),
    publicKey: z.string(),
    secretKey: z.string(),
    webhookSecret: z.string(),
    merchantId: z.string(),
    paymentKey: z.string(),
    apiBaseUrl: z.string(),
})

type GatewayFormValues = z.infer<typeof gatewaySchema>

const PROVIDERS: { id: GatewayProvider; label: string; icon: React.ReactNode }[] = [
    { id: "stripe", label: "Stripe", icon: <CreditCard className="h-5 w-5 text-indigo-500" /> },
    { id: "paypal", label: "PayPal", icon: <CreditCard className="h-5 w-5 text-blue-500" /> },
    { id: "cryptomus", label: "Cryptomus", icon: <Bitcoin className="h-5 w-5 text-orange-500" /> },
]

function formFromGateway(gw: GatewayView, apiBaseUrl: string): GatewayFormValues {
    return {
        enabled: gw.enabled,
        testMode: gw.test_mode,
        publicKey: gw.public_key ?? "",
        secretKey: "",
        webhookSecret: "",
        merchantId: gw.merchant_id ?? "",
        paymentKey: "",
        apiBaseUrl,
    }
}

export function PaymentClient({ initialData }: { initialData: PaymentSettingsView }) {
    const [provider, setProvider] = useState<GatewayProvider>("stripe")
    const [view, setView] = useState<PaymentSettingsView>(initialData)
    const [isTesting, setIsTesting] = useState(false)

    const form = useForm<GatewayFormValues>({
        resolver: zodResolver(gatewaySchema),
        defaultValues: formFromGateway(initialData.gateways.stripe, initialData.api_base_url),
    })

    const activeGw = view.gateways[provider]
    const isCryptomus = provider === "cryptomus"
    const isEnabled = form.watch("enabled")

    const handleProviderSwitch = (next: GatewayProvider) => {
        const current = form.getValues()
        // Discard unsaved secrets when switching; keep non-secret edits only in form for active tab.
        setProvider(next)
        form.reset(formFromGateway(view.gateways[next], current.apiBaseUrl || view.api_base_url))
    }

    const validateBeforeSubmit = (values: GatewayFormValues): string | null => {
        const gw = view.gateways[provider]
        if (!values.enabled) return null

        if (provider === "cryptomus") {
            if (!values.merchantId.trim()) return "Merchant UUID is required to enable Cryptomus"
            if (!values.paymentKey.trim() && !gw.has_payment_key) return "Payment API Key is required to enable Cryptomus"
            return null
        }

        if (!values.publicKey.trim()) return "Public key is required to enable this gateway"
        if (!values.secretKey.trim() && !gw.has_secret_key) return "Secret key is required to enable this gateway"
        if (!values.webhookSecret.trim() && !gw.has_webhook_secret) {
            return provider === "paypal" ? "Webhook ID is required to enable PayPal" : "Webhook secret is required to enable Stripe"
        }

        if (provider === "stripe") {
            const pub = values.publicKey.trim()
            const sec = values.secretKey.trim()
            if (values.testMode) {
                if (!pub.startsWith("pk_test_")) return "Test Mode requires a pk_test_ public key"
                if (sec && !sec.startsWith("sk_test_")) return "Test Mode requires an sk_test_ secret key"
            } else {
                if (!pub.startsWith("pk_live_")) return "Live mode requires a pk_live_ public key"
                if (sec && !sec.startsWith("sk_live_")) return "Live mode requires an sk_live_ secret key"
            }
        }
        return null
    }

    const onSubmit = async (values: GatewayFormValues) => {
        const errMsg = validateBeforeSubmit(values)
        if (errMsg) {
            toast.error(errMsg)
            return
        }

        const payload = {
            provider,
            api_base_url: values.apiBaseUrl.trim(),
            enabled: values.enabled,
            test_mode: values.testMode,
            public_key: values.publicKey.trim(),
            secret_key: values.secretKey.trim(),
            webhook_secret: values.webhookSecret.trim(),
            merchant_id: values.merchantId.trim(),
            payment_key: values.paymentKey.trim(),
        }

        try {
            const res = await ApiClient.post<PaymentSettingsView>("/admin/settings/payment", payload)
            if (res.status === "success" && res.data) {
                setView(res.data)
                form.reset(formFromGateway(res.data.gateways[provider], res.data.api_base_url))
                toast.success("Payment settings saved")
            } else {
                toast.error(res.message || "Failed to save settings")
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to save settings")
        }
    }

    const testGateway = async () => {
        setIsTesting(true)
        const toastId = toast.loading("Testing credentials…")
        try {
            const res = await ApiClient.post("/admin/settings/payment/test", { provider })
            if (res.status === "success") {
                toast.success(res.message || "Credentials OK", { id: toastId })
            } else {
                toast.error(res.message || "Test failed", { id: toastId })
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Test failed", { id: toastId })
        } finally {
            setIsTesting(false)
        }
    }

    const getStatusBadge = (p: GatewayProvider) => {
        const cfg = view.gateways[p]
        const enabled = p === provider ? form.watch("enabled") : cfg.enabled
        const testMode = p === provider ? form.watch("testMode") : cfg.test_mode
        if (!enabled) return <Badge variant="secondary" className="bg-[#0b1f1c]/5 text-[#5a736c] border-[#0b1f1c]/10">Disabled</Badge>
        if (testMode) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Test Mode</Badge>
        return <Badge variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200">Live</Badge>
    }

    const webhookURL = view.webhook_urls?.[provider] ?? ""

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Payment Settings</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Configure payment gateways. Secrets are never shown after save — leave blank to keep existing.</p>
                </div>
            </div>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <div className="p-3 bg-[#0f5c52] rounded-xl shadow-none">
                        <CreditCard className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                        <CardTitle className="text-xl text-[#0b1f1c]">Gateway Configuration</CardTitle>
                        <CardDescription className="text-[#5a736c]">One provider is saved at a time. Set API Base URL for webhook callbacks.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-8 space-y-8">
                    <div className="space-y-4">
                        <Label className="text-sm font-bold text-[#5a736c] uppercase tracking-wider">Select Provider</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" role="tablist" aria-label="Payment providers">
                            {PROVIDERS.map(({ id, label, icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={provider === id}
                                    onClick={() => handleProviderSwitch(id)}
                                    className={cn(
                                        "relative p-4 rounded-xl border-2 text-left transition-all duration-200",
                                        provider === id
                                            ? "border-[#0f5c52] bg-[#0f5c52]/5 ring-4 ring-[#0f5c52]/10"
                                            : "border-[#0b1f1c]/8 bg-white hover:border-[#0f5c52]/30 hover:bg-[#f0f4f2]/40"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        {icon}
                                        {provider === id && <div className="h-2 w-2 rounded-full bg-[#0f5c52]" />}
                                    </div>
                                    <div className="font-bold text-[#0b1f1c] text-sm mb-2">{label}</div>
                                    {getStatusBadge(id)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 rounded-2xl border border-[#0b1f1c]/8 bg-[#f0f4f2]/40 space-y-8">
                        <div className="space-y-2">
                            <Label htmlFor="apiBaseUrl" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">API Base URL</Label>
                            <Input
                                id="apiBaseUrl"
                                {...form.register("apiBaseUrl")}
                                placeholder="https://api.example.com or http://localhost:8000"
                                className="bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none font-mono text-sm"
                            />
                            <p className="text-xs text-[#5a736c]">Backend origin for webhook callbacks (Admin setting only — not from .env). Example: https://api.example.com</p>
                            {webhookURL && (
                                <p className="text-xs text-[#0f5c52] font-mono break-all">Webhook: {webhookURL}</p>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-6 justify-between border-b border-[#0b1f1c]/8 pb-6">
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-[#0b1f1c] capitalize flex items-center gap-2">
                                    {PROVIDERS.find(p => p.id === provider)?.icon}
                                    {PROVIDERS.find(p => p.id === provider)?.label} Control
                                </h3>
                                <p className="text-sm text-[#5a736c]">Manage operational state and environment.</p>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-[#0b1f1c]/8 shadow-none">
                                    <Label htmlFor="enabled" className="font-semibold text-[#0b1f1c]">Enable Gateway</Label>
                                    <input
                                        id="enabled"
                                        type="checkbox"
                                        {...form.register("enabled")}
                                        className="h-5 w-5 rounded border-[#0b1f1c]/20 text-[#0f5c52] focus:ring-[#0f5c52]/30 transition-colors"
                                    />
                                </div>
                                {!isCryptomus && (
                                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-[#0b1f1c]/8 shadow-none">
                                        <Label htmlFor="testMode" className="font-semibold text-[#0b1f1c]">Test Mode</Label>
                                        <input
                                            id="testMode"
                                            type="checkbox"
                                            {...form.register("testMode")}
                                            className="h-5 w-5 rounded border-[#0b1f1c]/20 text-amber-600 focus:ring-amber-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Shield className="h-4 w-4 text-[#0f5c52]" />
                                <h4 className="text-sm font-bold text-[#0b1f1c] uppercase tracking-wide">
                                    {isCryptomus ? "Cryptomus Credentials" : "API Credentials"}
                                </h4>
                            </div>

                            {isCryptomus ? (
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="merchantId" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">Merchant UUID</Label>
                                        <Input
                                            id="merchantId"
                                            {...form.register("merchantId")}
                                            placeholder="Cryptomus Merchant UUID"
                                            className="bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="paymentKey" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">
                                            Payment API Key {activeGw.has_payment_key ? <span className="normal-case text-[#0f5c52]">(saved — leave blank to keep)</span> : null}
                                        </Label>
                                        <Input
                                            id="paymentKey"
                                            type="password"
                                            autoComplete="new-password"
                                            {...form.register("paymentKey")}
                                            placeholder={activeGw.has_payment_key ? "••••••••" : "Enter Payment API Key"}
                                            className="bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none"
                                        />
                                    </div>
                                    <div className="md:col-span-2 p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-800">
                                        <p className="font-semibold mb-1">How to get credentials</p>
                                        <ol className="list-decimal list-inside space-y-1 text-orange-700">
                                            <li>Log in to app.cryptomus.com → Settings → Merchant for Merchant UUID</li>
                                            <li>Settings → API Keys → Payment for Payment API Key (also verifies webhooks)</li>
                                            <li>Set webhook URL to the Cryptomus URL shown above</li>
                                        </ol>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="publicKey" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">
                                            {provider === "paypal" ? "Client ID" : "Public Key"}
                                        </Label>
                                        <Input
                                            id="publicKey"
                                            {...form.register("publicKey")}
                                            placeholder={`Enter ${provider} ${provider === "paypal" ? "client ID" : "public key"}`}
                                            className={cn("bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none", form.formState.errors.publicKey && isEnabled && "border-red-400")}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="secretKey" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">
                                            Secret Key {activeGw.has_secret_key ? <span className="normal-case text-[#0f5c52]">(saved — leave blank to keep)</span> : null}
                                        </Label>
                                        <Input
                                            id="secretKey"
                                            type="password"
                                            autoComplete="new-password"
                                            {...form.register("secretKey")}
                                            placeholder={activeGw.has_secret_key ? "••••••••" : `Enter ${provider} secret key`}
                                            className="bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none"
                                        />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="webhookSecret" className="text-sm font-semibold text-[#5a736c] uppercase tracking-tight">
                                            {provider === "paypal" ? "Webhook ID" : "Webhook Secret"}{" "}
                                            {activeGw.has_webhook_secret ? <span className="normal-case text-[#0f5c52]">(saved — leave blank to keep)</span> : null}
                                        </Label>
                                        <Input
                                            id="webhookSecret"
                                            type="password"
                                            autoComplete="new-password"
                                            {...form.register("webhookSecret")}
                                            placeholder={activeGw.has_webhook_secret ? "••••••••" : (provider === "paypal" ? "Enter PayPal Webhook ID" : `Enter ${provider} webhook secret`)}
                                            className="bg-white border-[#0b1f1c]/10 focus-visible:ring-[#0f5c52]/30 py-5 rounded-lg shadow-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 flex flex-wrap gap-4 items-center border-t border-[#0b1f1c]/8">
                            <Button
                                type="submit"
                                disabled={form.formState.isSubmitting}
                                className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] shadow-none px-6 py-4 rounded-xl flex gap-2 font-bold disabled:opacity-60"
                            >
                                {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {form.formState.isSubmitting ? "Saving…" : "Save Configuration"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isTesting || !isEnabled}
                                onClick={() => void testGateway()}
                                className="border-[#0b1f1c]/15 shadow-none px-6 py-4 rounded-xl flex gap-2 font-bold disabled:opacity-60"
                            >
                                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                                Test Credentials
                            </Button>
                        </div>
                    </form>

                    <div className="p-4 bg-[#0f5c52]/5 rounded-2xl border border-[#0f5c52]/15 flex gap-4">
                        <div className="p-2 bg-white rounded-xl shadow-none border border-[#0f5c52]/15 h-fit">
                            <AlertCircle className="h-5 w-5 text-[#0f5c52]" />
                        </div>
                        <div className="space-y-1">
                            <h5 className="text-sm font-bold text-[#0b1f1c]">Security</h5>
                            <p className="text-xs text-[#5a736c] font-medium leading-relaxed">
                                Secrets are encrypted at rest and never returned to the browser. Leave password fields blank to keep the current value.
                                Cryptomus webhooks are verified with the Payment API Key.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
