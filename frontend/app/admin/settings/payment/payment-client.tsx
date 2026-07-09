"use client"

import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Shield, Save, AlertCircle, Bitcoin, Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

export type GatewayProvider = 'stripe' | 'paypal' | 'cryptomus'

export interface ConfigState {
    enabled: boolean
    testMode: boolean
    publicKey: string
    secretKey: string
    webhookSecret: string
    merchantId?: string
    paymentKey?: string
}

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const gatewaySchema = z.object({
    enabled: z.boolean(),
    testMode: z.boolean(),
    publicKey: z.string(),
    secretKey: z.string(),
    webhookSecret: z.string(),
    merchantId: z.string(),
    paymentKey: z.string(),
}).superRefine((data, ctx) => {
    if (!data.enabled) return
    if (!data.merchantId?.trim() && !data.publicKey?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Public key (or Merchant UUID) is required to enable this gateway", path: ["publicKey"] })
    }
    if (!data.merchantId?.trim() && !data.secretKey?.trim() && !data.paymentKey?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Secret key (or Payment API Key) is required to enable this gateway", path: ["secretKey"] })
    }
})

type GatewayFormValues = z.infer<typeof gatewaySchema>

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVIDERS: { id: GatewayProvider; label: string; icon: React.ReactNode }[] = [
    { id: 'stripe', label: 'Stripe', icon: <CreditCard className="h-5 w-5 text-indigo-500" /> },
    { id: 'paypal', label: 'PayPal', icon: <CreditCard className="h-5 w-5 text-blue-500" /> },
    { id: 'cryptomus', label: 'Cryptomus', icon: <Bitcoin className="h-5 w-5 text-orange-500" /> },
]

export const DEFAULT_CONFIGS: Record<GatewayProvider, ConfigState> = {
    stripe: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    paypal: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    cryptomus: { enabled: false, testMode: false, publicKey: '', secretKey: '', webhookSecret: '', merchantId: '', paymentKey: '' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PaymentClient({ initialConfigs }: { initialConfigs: Record<GatewayProvider, ConfigState> }) {
    const [provider, setProvider] = useState<GatewayProvider>('stripe')
    // Keep a full copy of all 3 providers' data so switching tabs doesn't lose unsaved changes
    const [allConfigs, setAllConfigs] = useState<Record<GatewayProvider, ConfigState>>(initialConfigs)
    const isFirstMount = useRef(true)

    const form = useForm<GatewayFormValues>({
        resolver: zodResolver(gatewaySchema),
        defaultValues: {
            enabled: initialConfigs.stripe.enabled,
            testMode: initialConfigs.stripe.testMode,
            publicKey: initialConfigs.stripe.publicKey,
            secretKey: initialConfigs.stripe.secretKey,
            webhookSecret: initialConfigs.stripe.webhookSecret,
            merchantId: initialConfigs.stripe.merchantId ?? '',
            paymentKey: initialConfigs.stripe.paymentKey ?? '',
        }
    })

    const fetchConfigs = async () => {
        try {
            const data = await ApiClient.get('/admin/settings');
            if (data.status === 'success' && Array.isArray(data.data)) {
                const raw: Record<string, string> = {}
                for (const row of data.data) raw[row.setting_key] = row.setting_value

                const next = { ...allConfigs }
                for (const p of ['stripe', 'paypal', 'cryptomus'] as GatewayProvider[]) {
                    next[p] = {
                        enabled: raw[`${p}_enabled`] === '1',
                        testMode: raw[`${p}_test_mode`] === '1',
                        publicKey: raw[`${p}_public_key`] ?? '',
                        secretKey: raw[`${p}_secret_key`] ?? '',
                        webhookSecret: (p === 'paypal' ? raw[`${p}_webhook_id`] : raw[`${p}_webhook_secret`]) ?? '',
                        merchantId: raw[`${p}_merchant_id`] ?? '',
                        paymentKey: raw[`${p}_payment_key`] ?? '',
                    }
                }
                setAllConfigs(next)
                
                const active = next[provider]
                form.reset({
                    enabled: active.enabled,
                    testMode: active.testMode,
                    publicKey: active.publicKey,
                    secretKey: active.secretKey,
                    webhookSecret: active.webhookSecret,
                    merchantId: active.merchantId ?? '',
                    paymentKey: active.paymentKey ?? '',
                })
            }
        } catch (error) {
            console.error("Failed to fetch payment settings on mount:", error);
        }
    }

    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        fetchConfigs();
    }, []);

    // When tab switches: save current form values back, then reset to new provider's data
    const handleProviderSwitch = (newProvider: GatewayProvider) => {
        // Persist current form values into allConfigs
        const current = form.getValues()
        setAllConfigs(prev => ({
            ...prev,
            [provider]: {
                enabled: current.enabled,
                testMode: current.testMode,
                publicKey: current.publicKey ?? '',
                secretKey: current.secretKey ?? '',
                webhookSecret: current.webhookSecret ?? '',
                merchantId: current.merchantId ?? '',
                paymentKey: current.paymentKey ?? '',
            }
        }))
        // Reset form to new provider's saved data
        const next = allConfigs[newProvider]
        form.reset({
            enabled: next.enabled,
            testMode: next.testMode,
            publicKey: next.publicKey,
            secretKey: next.secretKey,
            webhookSecret: next.webhookSecret,
            merchantId: next.merchantId ?? '',
            paymentKey: next.paymentKey ?? '',
        })
        setProvider(newProvider)
    }

    const onSubmit = async (values: GatewayFormValues) => {
        // Build the merged config snapshot with current form values applied
        const merged = {
            ...allConfigs,
            [provider]: {
                enabled: values.enabled,
                testMode: values.testMode,
                publicKey: values.publicKey ?? '',
                secretKey: values.secretKey ?? '',
                webhookSecret: values.webhookSecret ?? '',
                merchantId: values.merchantId ?? '',
                paymentKey: values.paymentKey ?? '',
            }
        }

        const settings: Record<string, string> = {}
        for (const p of ['stripe', 'paypal', 'cryptomus'] as GatewayProvider[]) {
            const c = merged[p]
            settings[`${p}_enabled`] = c.enabled ? '1' : '0'
            settings[`${p}_test_mode`] = c.testMode ? '1' : '0'
            settings[`${p}_public_key`] = c.publicKey ?? ''
            settings[`${p}_secret_key`] = c.secretKey ?? ''
            if (p === 'paypal') {
                settings[`${p}_webhook_id`] = c.webhookSecret ?? ''
            } else {
                settings[`${p}_webhook_secret`] = c.webhookSecret ?? ''
            }
            settings[`${p}_merchant_id`] = c.merchantId ?? ''
            settings[`${p}_payment_key`] = c.paymentKey ?? ''
        }

        try {
            const res = await ApiClient.post('/admin/settings/update', { settings })
            if (res.status === 'success') {
                setAllConfigs(merged)
                toast.success("Payment settings saved successfully")
            } else {
                toast.error(res.message || "Failed to save settings")
            }
        } catch (e: any) {
            toast.error(e.message || "Failed to save settings")
        }
    }

    const getStatusBadge = (p: GatewayProvider) => {
        const cfg = allConfigs[p]
        // Reflect unsaved form changes for the active tab
        const enabled = p === provider ? form.watch('enabled') : cfg.enabled
        const testMode = p === provider ? form.watch('testMode') : cfg.testMode
        if (!enabled) return <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200">Disabled</Badge>
        if (testMode) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Test Mode</Badge>
        return <Badge variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200">Live</Badge>
    }

    const isCryptomus = provider === 'cryptomus'
    const isEnabled = form.watch('enabled')

    return (
        <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Payment Settings</h2>
                    <p className="text-muted-foreground">Configure payment gateways and transaction rules.</p>
                </div>
            </div>

            <Card className="shadow-lg border-indigo-100 ring-1 ring-slate-100">
                <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-indigo-50/50 bg-slate-50/50">
                    <div className="p-3 bg-indigo-600 rounded-xl shadow-md shadow-indigo-200">
                        <CreditCard className="h-6 w-6 text-white" />
                    </div>
                    <div className="space-y-1">
                        <CardTitle className="text-xl text-slate-800">Gateway Configuration</CardTitle>
                        <CardDescription>Select and configure your preferred payment providers.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-8 space-y-8">
                    {/* Provider Selection Tabs */}
                    <div className="space-y-4">
                        <Label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Select Provider</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {PROVIDERS.map(({ id, label, icon }) => (
                                <div
                                    key={id}
                                    onClick={() => handleProviderSwitch(id)}
                                    className={cn(
                                        "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                                        provider === id
                                            ? 'border-indigo-500 bg-indigo-50/30 ring-4 ring-indigo-50'
                                            : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50/50'
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        {icon}
                                        {provider === id && <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />}
                                    </div>
                                    <div className="font-bold text-slate-800 text-sm mb-2">{label}</div>
                                    {getStatusBadge(id)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Configuration Form */}
                    <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 rounded-2xl border border-indigo-50 bg-slate-50/30 space-y-8">
                        {/* Enable / Test Mode toggles */}
                        <div className="flex flex-col sm:flex-row gap-6 justify-between border-b border-indigo-50/50 pb-6">
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-slate-800 capitalize flex items-center gap-2">
                                    {PROVIDERS.find(p => p.id === provider)?.icon}
                                    {PROVIDERS.find(p => p.id === provider)?.label} Control
                                </h3>
                                <p className="text-sm text-slate-500">Manage operational state and environment.</p>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                    <Label htmlFor="enabled" className="font-semibold text-slate-700">Enable Gateway</Label>
                                    <input
                                        id="enabled"
                                        type="checkbox"
                                        {...form.register("enabled")}
                                        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                                    />
                                </div>
                                {!isCryptomus && (
                                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                        <Label htmlFor="testMode" className="font-semibold text-slate-700">Test Mode</Label>
                                        <input
                                            id="testMode"
                                            type="checkbox"
                                            {...form.register("testMode")}
                                            className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Credentials */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Shield className="h-4 w-4 text-indigo-500" />
                                <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">
                                    {isCryptomus ? 'Cryptomus Credentials' : 'API Credentials'}
                                </h4>
                            </div>

                            {isCryptomus ? (
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="merchantId" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Merchant UUID</Label>
                                        <Input
                                            id="merchantId"
                                            {...form.register("merchantId")}
                                            placeholder="Enter your Cryptomus Merchant UUID"
                                            className={cn("bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm font-mono text-sm", form.formState.errors.publicKey && "border-red-400")}
                                        />
                                        {form.formState.errors.publicKey && (
                                            <p className="text-[10px] text-red-500">{form.formState.errors.publicKey.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="paymentKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Payment API Key</Label>
                                        <Input
                                            id="paymentKey"
                                            type="password"
                                            {...form.register("paymentKey")}
                                            placeholder="Enter your Cryptomus Payment Key"
                                            className={cn("bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm", form.formState.errors.secretKey && "border-red-400")}
                                        />
                                        {form.formState.errors.secretKey && (
                                            <p className="text-[10px] text-red-500">{form.formState.errors.secretKey.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="webhookSecret" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Webhook Secret (optional)</Label>
                                        <Input
                                            id="webhookSecret"
                                            type="password"
                                            {...form.register("webhookSecret")}
                                            placeholder="Used to verify Cryptomus webhook signatures"
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                    <div className="md:col-span-2 p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-800">
                                        <p className="font-semibold mb-1">📋 How to get your credentials</p>
                                        <ol className="list-decimal list-inside space-y-1 text-orange-700">
                                            <li>Log in to your <span className="font-mono font-semibold">app.cryptomus.com</span> account</li>
                                            <li>Go to <strong>Settings → Merchant</strong> to find your Merchant UUID</li>
                                            <li>Go to <strong>Settings → API Keys → Payment</strong> to generate a Payment API Key</li>
                                            <li>Set your webhook URL to: <span className="font-mono font-semibold">{typeof window !== 'undefined' ? window.location.origin.replace('3000', '8000') : ''}/payment/cryptomus/webhook</span></li>
                                        </ol>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="publicKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Public Key</Label>
                                        <Input
                                            id="publicKey"
                                            {...form.register("publicKey")}
                                            placeholder={`Enter ${provider} public key`}
                                            className={cn("bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm", form.formState.errors.publicKey && isEnabled && "border-red-400")}
                                        />
                                        {form.formState.errors.publicKey && isEnabled && (
                                            <p className="text-[10px] text-red-500">{form.formState.errors.publicKey.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="secretKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Secret Key</Label>
                                        <Input
                                            id="secretKey"
                                            type="password"
                                            {...form.register("secretKey")}
                                            placeholder={`Enter ${provider} secret key`}
                                            className={cn("bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm", form.formState.errors.secretKey && isEnabled && "border-red-400")}
                                        />
                                        {form.formState.errors.secretKey && isEnabled && (
                                            <p className="text-[10px] text-red-500">{form.formState.errors.secretKey.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="webhookSecret" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">
                                            {provider === 'paypal' ? 'Webhook ID' : 'Webhook Secret'}
                                        </Label>
                                        <Input
                                            id="webhookSecret"
                                            type="password"
                                            {...form.register("webhookSecret")}
                                            placeholder={provider === 'paypal' ? 'Enter PayPal Webhook ID' : `Enter ${provider} webhook secret`}
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Save Button */}
                        <div className="pt-4 flex flex-wrap gap-4 items-center border-t border-indigo-50/50">
                            <Button
                                type="submit"
                                disabled={form.formState.isSubmitting}
                                className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 px-6 py-4 rounded-xl flex gap-2 font-bold disabled:opacity-60"
                            >
                                {form.formState.isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                {form.formState.isSubmitting ? 'Saving…' : 'Save Configuration'}
                            </Button>
                        </div>
                    </form>

                    {/* Security Notice */}
                    <div className="p-4 bg-indigo-900/5 rounded-2xl border border-indigo-100 flex gap-4">
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-50 h-fit">
                            <AlertCircle className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="space-y-1">
                            <h5 className="text-sm font-bold text-indigo-900">Security Requirement</h5>
                            <p className="text-xs text-indigo-800/70 font-medium leading-relaxed">
                                Always ensure that API credentials are kept private and never committed to source control.
                                For Cryptomus, verify webhook signatures on every callback to prevent fraud.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
