import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Payment Settings",
}

import { fetchServer } from "@/lib/fetch-server"
import { PaymentClient, type PaymentSettingsView, type GatewayProvider } from "./payment-client"

const EMPTY_GATEWAY = {
    enabled: false,
    test_mode: true,
    public_key: "",
    merchant_id: "",
    has_secret_key: false,
    has_webhook_secret: false,
    has_payment_key: false,
}

const DEFAULT_VIEW: PaymentSettingsView = {
    api_base_url: "http://localhost:8000",
    webhook_urls: {
        stripe: "http://localhost:8000/api/v1/payment/stripe/webhook",
        paypal: "http://localhost:8000/api/v1/payment/paypal/webhook",
        cryptomus: "http://localhost:8000/api/v1/payment/cryptomus/webhook",
    },
    gateways: {
        stripe: { ...EMPTY_GATEWAY, test_mode: true },
        paypal: { ...EMPTY_GATEWAY, test_mode: true },
        cryptomus: { ...EMPTY_GATEWAY, test_mode: false },
    },
}

function normalizeView(raw: PaymentSettingsView): PaymentSettingsView {
    const gateways = { ...DEFAULT_VIEW.gateways }
    for (const p of ["stripe", "paypal", "cryptomus"] as GatewayProvider[]) {
        const g = raw.gateways?.[p]
        if (g) {
            gateways[p] = {
                enabled: Boolean(g.enabled),
                test_mode: Boolean(g.test_mode),
                public_key: g.public_key ?? "",
                merchant_id: g.merchant_id ?? "",
                has_secret_key: Boolean(g.has_secret_key),
                has_webhook_secret: Boolean(g.has_webhook_secret),
                has_payment_key: Boolean(g.has_payment_key),
            }
        }
    }
    return {
        api_base_url: raw.api_base_url || DEFAULT_VIEW.api_base_url,
        webhook_urls: { ...DEFAULT_VIEW.webhook_urls, ...(raw.webhook_urls || {}) },
        gateways,
    }
}

export default async function PaymentSettingsPage() {
    let initialData = DEFAULT_VIEW

    try {
        const data = await fetchServer<PaymentSettingsView>("/admin/settings/payment")
        if (data.status === "success" && data.data) {
            initialData = normalizeView(data.data)
        }
    } catch (e) {
        console.error("Failed to fetch admin payment settings:", e)
    }

    return <PaymentClient initialData={initialData} />
}
