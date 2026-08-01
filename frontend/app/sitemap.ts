import { MetadataRoute } from "next"
import { getPublicSettings } from "@/lib/services/settings"
import { resolveSiteBaseUrl } from "@/lib/site-url"
import { publicSitemapEntries } from "@/lib/seo"

/** Stable lastModified so crawlers are not told every URL changed on each hit. */
const SITE_LAST_MODIFIED = new Date("2026-01-01T00:00:00.000Z")

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getPublicSettings()
  const baseUrl = await resolveSiteBaseUrl(settings)

  return publicSitemapEntries(baseUrl).map((entry, index) => ({
    url: entry.url,
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1.0 : 0.4,
  }))
}
