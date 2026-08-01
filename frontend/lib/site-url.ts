import { headers } from "next/headers"
import type { PublicSettings } from "@/lib/settings-context"
import { pickSiteBaseUrl } from "@/lib/seo"

/**
 * Resolve canonical site origin for sitemap / robots.
 * Prefer admin-configured site_base_url over request Host headers.
 */
export async function resolveSiteBaseUrl(
  settings?: PublicSettings | null
): Promise<string> {
  let host: string | null = null
  let proto: string | null = null
  try {
    const reqHeaders = await headers()
    host = reqHeaders.get("x-forwarded-host") || reqHeaders.get("host")
    proto = reqHeaders.get("x-forwarded-proto") || "https"
  } catch {
    // build-time / non-request context
  }

  return pickSiteBaseUrl({
    siteBaseUrl: settings?.site_base_url,
    host,
    proto,
    envBaseUrl: process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL,
  })
}
