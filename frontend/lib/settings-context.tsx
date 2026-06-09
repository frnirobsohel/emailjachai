"use client"
import React, { createContext, useContext, useState } from 'react';

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
    github_url?: string;
    cryptomus_enabled?: string;
    stripe_enabled?: string;
    paypal_enabled?: string;
};

const SettingsContext = createContext<PublicSettings>({});

export const SettingsProvider = ({ settings: initialSettings, children }: { settings: PublicSettings, children: React.ReactNode }) => {
    const [settings] = useState<PublicSettings>(initialSettings || {});

    return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => useContext(SettingsContext);

export function useSiteTitle(): string {
    const settings = useSettings();
    return settings?.site_title || 'EmailJachai Pro';
}
