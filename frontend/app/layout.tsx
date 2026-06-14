import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import Providers from "@/providers";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsProvider, PublicSettings } from "@/lib/settings-context";
import { getPublicSettings } from "@/lib/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  let title = "EmailJachai Pro";
  let tagline = "Professional Email Verification Platform";
  
  const settings = await getPublicSettings();
  if (settings) {
      title = settings.site_title || title;
      tagline = settings.site_tagline || tagline;
  }
  
  return {
    title: { default: title, template: "%s | " + title },
    description: tagline,
  };
}

import { Toaster } from "react-hot-toast";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPublicSettings() || {};

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <SettingsProvider settings={settings}>
          <Providers>
            <AppShell>
              {children}
            </AppShell>
          </Providers>
        </SettingsProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
