import { fetchServer } from "@/lib/fetch-server"
import { PaymentClient, GatewayProvider, ConfigState } from "./payment-client"

const DEFAULT_CONFIGS: Record<GatewayProvider, ConfigState> = {
    stripe: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    paypal: { enabled: false, testMode: true, publicKey: '', secretKey: '', webhookSecret: '' },
    cryptomus: { enabled: false, testMode: false, publicKey: '', secretKey: '', webhookSecret: '', merchantId: '', paymentKey: '' },
}

export default async function PaymentSettingsPage() {
    let initialConfigs = { ...DEFAULT_CONFIGS };
    
    try {
        const data = await fetchServer('/admin/settings');
        if (data.status === 'success' && Array.isArray(data.data)) {
            const raw: Record<string, string> = {}
            for (const row of data.data) raw[row.setting_key] = row.setting_value

            const next = { ...initialConfigs }
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
            initialConfigs = next;
        }
    } catch (e) {
        console.error("Failed to fetch admin payment settings:", e);
    }

    return <PaymentClient initialConfigs={initialConfigs} />
}
