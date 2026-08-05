"use client"
import React, { createContext, useContext, useEffect } from 'react';
import { useConfigStore } from '@/stores/config-store';

export type PublicSettings = {
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
    turnstile_site_key?: string;
    turnstile_required?: string;
    max_emails_per_job?: string;
};

const SettingsContext = createContext<PublicSettings>({});

export const SettingsProvider = ({ settings: initialSettings, children }: { settings: PublicSettings, children: React.ReactNode }) => {
    // Always sync SSR/public settings into the client store so auth/sidebar
    // never keep a stale in-memory title after a brand save + navigation.
    useEffect(() => {
        if (initialSettings && Object.keys(initialSettings).length > 0) {
            useConfigStore.getState().setSettings(initialSettings);
        }
    }, [initialSettings]);

    const liveSettings = useConfigStore((state) => state.settings);
    // Prefer the latest store value once hydrated; fall back to SSR props on first paint.
    const settings = liveSettings && Object.keys(liveSettings).length > 0
        ? liveSettings
        : (initialSettings || {});

    return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => useContext(SettingsContext);

export function useSiteTitle(): string {
    const settings = useSettings();
    return settings?.site_title || 'EmailJachai Pro';
}
