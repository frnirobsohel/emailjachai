import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
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
import { BrandHeadScripts } from "@/components/brand-head-scripts";
import { Toaster } from "react-hot-toast";
import { resolveSiteBaseUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<Metadata> {
  let title = "EmailJachai Pro";
  let tagline = "Professional Email Verification Platform";
  let favicon = "/icon.svg";
  let googleVerification: string | undefined = undefined;

  const settings = await getPublicSettings();
  if (settings) {
      title = settings.site_title || title;
      tagline = settings.site_tagline || tagline;
      if (settings.favicon_url) {
          favicon = settings.favicon_url;
      }
      if (settings.google_site_verification) {
          googleVerification = settings.google_site_verification;
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

  const baseUrl = await resolveSiteBaseUrl(settings);

  return {
    ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
    title: { default: title, template: "%s | " + title },
    description: tagline,
    applicationName: title,
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description: tagline,
    },
    icons: {
      icon: iconList,
      shortcut: favicon,
      apple: favicon,
    },
    verification: googleVerification ? { google: googleVerification } : undefined,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPublicSettings() || {};
  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") || "";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <BrandHeadScripts
          headScriptsJson={settings.head_scripts_json}
          pathname={pathname}
        />
      </head>
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
