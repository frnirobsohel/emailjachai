import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Buy Credits",
}

export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { BuyCreditsClient } from "@/features/credits/components/credits-client"
import type { Package } from "@/features/credits/components/credits-client"

export default async function BuyCreditsPage() {
    let initialPackages: Package[] = [];
    const initialSettings = {
        cryptomusEnabled: false,
        stripeEnabled: false,
        paypalEnabled: false,
    };
    
    try {
        const [packagesResult, settingsResult] = await Promise.all([
            fetchServer('/packages/list'),
            fetchServer('/settings/public')
        ]);

        if (packagesResult.status === 'success') {
            initialPackages = (packagesResult.data as Package[]).filter(p => p.status === 'active');
        }

        if (settingsResult.status === 'success' && settingsResult.data) {
            const raw = settingsResult.data as Record<string, string>;
            initialSettings.cryptomusEnabled = raw['cryptomus_enabled'] === '1';
            initialSettings.stripeEnabled = raw['stripe_enabled'] === '1';
            initialSettings.paypalEnabled = raw['paypal_enabled'] === '1';
        }
    } catch (e) {
        console.error("Failed to fetch credits data:", e);
    }

    return <BuyCreditsClient initialPackages={initialPackages} initialSettings={initialSettings} />
}
