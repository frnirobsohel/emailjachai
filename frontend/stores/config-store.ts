import { create } from 'zustand';
import { ApiClient } from '@/lib/api-client';

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
    github_url?: string;
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
    fetchPackages: (force?: boolean) => Promise<void>;
    fetchSettings: (force?: boolean) => Promise<void>;
    setPackages: (packages: Package[]) => void;
    setSettings: (settings: PublicSettings) => void;
}

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
    fetchPackages: async (force = false) => {
        const { packages, isLoadingPackages } = get();
        if (isLoadingPackages) return;
        if (!force && packages && packages.length > 0) return; // Session Cache Hit!

        set({ isLoadingPackages: true });
        try {
            const result = await ApiClient.get<Package[]>('/packages/list');
            if (result.status === 'success' && result.data) {
                const activePkgs = result.data.filter((p: Package) => p.status === 'active');
                set({ packages: activePkgs });
            }
        } catch (error) {
            console.error("Failed to fetch packages in store:", error);
        } finally {
            set({ isLoadingPackages: false });
        }
    },
    fetchSettings: async (force = false) => {
        const { settings, isLoadingSettings } = get();
        if (isLoadingSettings) return;
        if (!force && settings) return; // Session Cache Hit!

        set({ isLoadingSettings: true });
        try {
            const result = await ApiClient.get<PublicSettings>('/settings/public');
            if (result.status === 'success' && result.data) {
                set({ settings: result.data });
            }
        } catch (error) {
            console.error("Failed to fetch public settings in store:", error);
        } finally {
            set({ isLoadingSettings: false });
        }
    },
    setPackages: (packages) => set({ packages }),
    setSettings: (settings) => set({ settings }),
}));
