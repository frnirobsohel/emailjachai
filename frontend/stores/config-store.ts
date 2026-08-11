import { create } from 'zustand';
import { ApiClient } from '@/lib/api-client';

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

export interface PublicSettings {
    site_title?: string;
    site_tagline?: string;
    logo_url?: string;
    favicon_url?: string;
    primary_color?: string;
    nav_style?: string;
    support_email?: string;
    help_center_url?: string;
    twitter_url?: string;
    linkedin_url?: string;
    youtube_url?: string;
    facebook_url?: string;
    head_scripts_json?: string;
    custom_robots_txt?: string;
    use_custom_robots?: string;
    google_site_verification?: string;
    site_base_url?: string;
    cryptomus_enabled?: string;
    stripe_enabled?: string;
    paypal_enabled?: string;
    maintenance_mode?: string;
    maintenance_message?: string;
}

interface ConfigState {
    packages: Package[] | null;
    settings: PublicSettings | null;
    isLoadingPackages: boolean;
    isLoadingSettings: boolean;
    packagesFetchedAt: number;
    settingsFetchedAt: number;
    fetchPackages: (force?: boolean) => Promise<void>;
    fetchSettings: (force?: boolean) => Promise<void>;
    setPackages: (packages: Package[]) => void;
    setSettings: (settings: PublicSettings) => void;
}

const FETCH_COOLDOWN_MS = 60_000;

/**
 * useConfigStore
 *
 * Client-side session store for caching static elements (like site settings, pricing packages).
 * This prevents unnecessary repetitive fetch requests to the API during the active session.
 */
export const useConfigStore = create<ConfigState>((set, get) => ({
    packages: null,
    settings: null,
    isLoadingPackages: false,
    isLoadingSettings: false,
    packagesFetchedAt: 0,
    settingsFetchedAt: 0,
    fetchPackages: async (force = false) => {
        const { packages, isLoadingPackages, packagesFetchedAt } = get();
        if (isLoadingPackages) return;
        if (!force && packages && packages.length > 0) return; // Session Cache Hit!
        if (!force && packagesFetchedAt && Date.now() - packagesFetchedAt < FETCH_COOLDOWN_MS) return;

        set({ isLoadingPackages: true });
        try {
            const result = await ApiClient.get<Package[]>('/packages/list');
            if (result.status === 'success' && result.data) {
                const activePkgs = result.data.filter((p: Package) => p.status === 'active');
                set({ packages: activePkgs, packagesFetchedAt: Date.now() });
            } else {
                set({ packagesFetchedAt: Date.now() });
            }
        } catch (error) {
            // Mark attempt time so 429 / network errors don't retry-loop
            set({ packagesFetchedAt: Date.now() });
            console.error("Failed to fetch packages in store:", error);
        } finally {
            set({ isLoadingPackages: false });
        }
    },
    fetchSettings: async (force = false) => {
        const { settings, isLoadingSettings, settingsFetchedAt } = get();
        if (isLoadingSettings) return;
        if (!force && settings) return; // Session Cache Hit!
        if (!force && settingsFetchedAt && Date.now() - settingsFetchedAt < FETCH_COOLDOWN_MS) return;

        set({ isLoadingSettings: true });
        try {
            const result = await ApiClient.get<PublicSettings>('/settings/public');
            if (result.status === 'success' && result.data) {
                set({ settings: result.data, settingsFetchedAt: Date.now() });
            } else {
                set({ settingsFetchedAt: Date.now() });
            }
        } catch (error) {
            set({ settingsFetchedAt: Date.now() });
            console.error("Failed to fetch public settings in store:", error);
        } finally {
            set({ isLoadingSettings: false });
        }
    },
    setPackages: (packages) => set({ packages, packagesFetchedAt: Date.now() }),
    setSettings: (settings) => set({ settings, settingsFetchedAt: Date.now() }),
}));
