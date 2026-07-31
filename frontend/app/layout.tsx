import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "../public/fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "../public/fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

import Providers from "@/providers";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsProvider } from "@/lib/settings-context";
import { getPublicSettings } from "@/lib/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  let title = "EmailJachai Pro";
  let tagline = "Professional Email Verification Platform";
  let favicon = "/icon.svg";

  const settings = await getPublicSettings();
  if (settings) {
      title = settings.site_title || title;
      tagline = settings.site_tagline || tagline;
      if (settings.favicon_url) {
          favicon = settings.favicon_url;
      }
  }

  // Prefer custom favicon when set; keep local /icon.svg as fallback so the
  // tab never sits empty while a remote icon is still downloading / 404s.
  const iconList =
    favicon === "/icon.svg"
      ? [{ url: "/icon.svg", type: "image/svg+xml" }]
      : [
          { url: favicon },
          { url: "/icon.svg", type: "image/svg+xml" },
        ];

  return {
    title: { default: title, template: "%s | " + title },
    description: tagline,
    icons: {
      icon: iconList,
      shortcut: favicon,
      apple: favicon,
    },
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
