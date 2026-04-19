"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Shield, TestTube, Save, CheckCircle2, AlertCircle, Bitcoin } from "lucide-react"
import { ApiClient } from "@/lib/api-client"

type GatewayProvider = 'stripe' | 'paypal' | 'cryptomus'

interface ConfigState {
    enabled: boolean
    testMode: boolean
    publicKey: string
    secretKey: string
    webhookSecret: string
    merchantId?: string   // Cryptomus: Merchant UUID
    paymentKey?: string   // Cryptomus: Payment API Key
}

const PROVIDERS: { id: GatewayProvider; label: string; icon: React.ReactNode }[] = [
    { id: 'stripe', label: 'Stripe', icon: <CreditCard className="h-5 w-5 text-indigo-500" /> },
    { id: 'paypal', label: 'PayPal', icon: <CreditCard className="h-5 w-5 text-blue-500" /> },
    { id: 'cryptomus', label: 'Cryptomus', icon: <Bitcoin className="h-5 w-5 text-orange-500" /> },
]

const DEFAULT_CONFIGS: Record<GatewayProvider, ConfigState> = {
    stripe: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    paypal: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    cryptomus: { enabled: false, testMode: false, publicKey: '', secretKey: '', webhookSecret: '', merchantId: '', paymentKey: '' },
}

export default function PaymentSettingsPage() {
    const [provider, setProvider] = useState<GatewayProvider>('stripe')
    const [configs, setConfigs] = useState<Record<GatewayProvider, ConfigState>>(DEFAULT_CONFIGS)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)

    const currentConfig = configs[provider]

    // Load saved settings from DB on mount
    useEffect(() => {
        const load = async () => {
            try {
                const data = await ApiClient.get('/admin/settings')
                if (data.status === 'success' && Array.isArray(data.data)) {
                    const raw: Record<string, string> = {}
                    for (const row of data.data) raw[row.setting_key] = row.setting_value

                    setConfigs(prev => {
                        const next = { ...prev }
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
                        return next
                    })
                }
            } catch (e) {
                console.error('Failed to load payment settings', e)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const updateConfig = (field: keyof ConfigState, value: string | boolean) => {
        setConfigs(prev => ({
            ...prev,
            [provider]: { ...prev[provider], [field]: value }
        }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const settings: Record<string, string> = {}
            for (const p of ['stripe', 'paypal', 'cryptomus'] as GatewayProvider[]) {
                const c = configs[p]
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
            const res = await ApiClient.post('/admin/settings/update', { settings })
            if (res.status === 'success') {
                setSaved(true)
                setTimeout(() => setSaved(false), 3000)
            }
        } catch (e) {
            console.error('Failed to save settings', e)
        } finally {
            setSaving(false)
        }
    }

    const getStatusBadge = (p: GatewayProvider) => {
        const cfg = configs[p]
        if (!cfg.enabled) return <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200">Disabled</Badge>
        if (cfg.testMode) return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Test Mode</Badge>
        return <Badge variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200">Live</Badge>
    }

    if (loading) {
        return (
            <div className="flex-1 space-y-6">
                <div className="space-y-2">
                    <div className="h-9 w-64 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-96 max-w-full bg-slate-100 rounded animate-pulse" />
                </div>

                <Card className="shadow-lg border-indigo-100 ring-1 ring-slate-100">
                    <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-indigo-50/50 bg-slate-50/50">
                        <div className="h-12 w-12 bg-slate-200 rounded-xl animate-pulse" />
                        <div className="space-y-2 flex-1">
                            <div className="h-5 w-56 bg-slate-200 rounded animate-pulse" />
                            <div className="h-4 w-72 max-w-full bg-slate-100 rounded animate-pulse" />
                        </div>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="p-4 rounded-xl border-2 border-slate-100 bg-white space-y-3">
                                    <div className="h-5 w-5 bg-slate-200 rounded animate-pulse" />
                                    <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
                                    <div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" />
                                </div>
                            ))}
                        </div>

                        <div className="p-6 rounded-2xl border border-indigo-50 bg-slate-50/30 space-y-4">
                            <div className="h-5 w-40 bg-slate-200 rounded animate-pulse" />
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="h-12 bg-white border border-slate-200 rounded-lg animate-pulse" />
                                <div className="h-12 bg-white border border-slate-200 rounded-lg animate-pulse" />
                                <div className="h-12 md:col-span-2 bg-white border border-slate-200 rounded-lg animate-pulse" />
                            </div>
                            <div className="h-10 w-44 bg-slate-200 rounded-xl animate-pulse" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const isCryptomus = provider === 'cryptomus'

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
                    {/* Provider Selection */}
                    <div className="space-y-4">
                        <Label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Select Provider</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {PROVIDERS.map(({ id, label, icon }) => (
                                <div
                                    key={id}
                                    onClick={() => setProvider(id)}
                                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${provider === id
                                        ? 'border-indigo-500 bg-indigo-50/30 ring-4 ring-indigo-50'
                                        : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50/50'
                                        }`}
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
                    <div className="p-6 rounded-2xl border border-indigo-50 bg-slate-50/30 space-y-8">
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
                                        checked={currentConfig.enabled}
                                        onChange={(e) => updateConfig('enabled', e.target.checked)}
                                        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                                    />
                                </div>
                                {!isCryptomus && (
                                    <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                        <Label htmlFor="testMode" className="font-semibold text-slate-700">Test Mode</Label>
                                        <input
                                            id="testMode"
                                            type="checkbox"
                                            checked={currentConfig.testMode}
                                            onChange={(e) => updateConfig('testMode', e.target.checked)}
                                            className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Shield className="h-4 w-4 text-indigo-500" />
                                <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">
                                    {isCryptomus ? 'Cryptomus Credentials' : 'API Credentials'}
                                </h4>
                            </div>

                            {isCryptomus ? (
                                /* Cryptomus-specific fields */
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="merchantId" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Merchant UUID</Label>
                                        <Input
                                            id="merchantId" name="merchantId" value={currentConfig.merchantId ?? ''}
                                            onChange={(e) => updateConfig('merchantId', e.target.value)}
                                            placeholder="Enter your Cryptomus Merchant UUID"
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="paymentKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Payment API Key</Label>
                                        <Input
                                            id="paymentKey" name="paymentKey" type="password"
                                            value={currentConfig.paymentKey ?? ''}
                                            onChange={(e) => updateConfig('paymentKey', e.target.value)}
                                            placeholder="Enter your Cryptomus Payment Key"
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="webhookSecret" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Webhook Secret (optional)</Label>
                                        <Input
                                            id="webhookSecret" name="webhookSecret" type="password"
                                            value={currentConfig.webhookSecret}
                                            onChange={(e) => updateConfig('webhookSecret', e.target.value)}
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
                                /* Standard gateway fields */
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="publicKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Public Key</Label>
                                        <Input
                                            id="publicKey" name="publicKey" value={currentConfig.publicKey}
                                            onChange={(e) => updateConfig('publicKey', e.target.value)}
                                            placeholder={`Enter ${provider} public key`}
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="secretKey" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">Secret Key</Label>
                                        <Input
                                            id="secretKey" name="secretKey" type="password"
                                            value={currentConfig.secretKey}
                                            onChange={(e) => updateConfig('secretKey', e.target.value)}
                                            placeholder={`Enter ${provider} secret key`}
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <Label htmlFor="webhookSecret" className="text-sm font-semibold text-slate-700 uppercase tracking-tight">
                                            {provider === 'paypal' ? 'Webhook ID' : 'Webhook Secret'}
                                        </Label>
                                        <Input
                                            id="webhookSecret" name="webhookSecret" type="password"
                                            value={currentConfig.webhookSecret}
                                            onChange={(e) => updateConfig('webhookSecret', e.target.value)}
                                            placeholder={provider === 'paypal' ? 'Enter PayPal Webhook ID' : `Enter ${provider} webhook secret`}
                                            className="bg-white border-slate-200 focus-visible:ring-indigo-500 py-5 rounded-lg shadow-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 flex flex-wrap gap-4 items-center justify-between border-t border-indigo-50/50">
                            <div className="flex gap-4">
                                <Button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 px-6 py-4 rounded-xl flex gap-2 font-bold"
                                >
                                    {saving ? (
                                        <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {saving ? 'Saving…' : 'Save Configuration'}
                                </Button>
                            </div>

                            <div className={`flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100 shadow-sm transition-all duration-500 ${saved ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                                }`}>
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">All Changes Saved</span>
                            </div>
                        </div>
                    </div>

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
