import type { Metadata } from "next"
import { getPublicSettings } from "@/lib/services/settings"
import { resolveSiteBaseUrl } from "@/lib/site-url"

export type PublicBrandMeta = {
  title: string
  tagline: string
  baseUrl: string
}

export async function getPublicBrandMeta(): Promise<PublicBrandMeta> {
  const settings = await getPublicSettings()
  return {
    title: settings?.site_title?.trim() || "Email Verification",
    tagline:
      settings?.site_tagline?.trim() ||
      "Professional Email Verification Platform",
    baseUrl: await resolveSiteBaseUrl(settings),
  }
}

/** Shared Open Graph + Twitter card fields for public marketing pages. */
export function buildShareMetadata(options: {
  title: string
  description: string
  siteName: string
  url?: string
  imageAlt?: string
}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: options.imageAlt || options.title,
  }

  return {
    openGraph: {
      title: options.title,
      description: options.description,
      type: "website",
      siteName: options.siteName,
      ...(options.url ? { url: options.url } : {}),
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: options.title,
      description: options.description,
      images: [image.url],
    },
  }
}
