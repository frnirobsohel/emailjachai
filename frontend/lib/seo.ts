import type { PublicSettings } from "@/lib/settings-context"

/**
 * Last-resort origin when settings + request host are unavailable.
 * Prefer FRONTEND_URL / NEXT_PUBLIC_SITE_URL — never a brand-specific domain.
 */
export function envSiteBaseUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  return raw.replace(/\/$/, "")
}

/**
 * Pure URL picker (unit-testable). Prefer admin site_base_url over request host,
 * then FRONTEND_URL env. Returns "" if nothing usable is configured.
 */
export function pickSiteBaseUrl(options: {
  siteBaseUrl?: string | null
  host?: string | null
  proto?: string | null
  envBaseUrl?: string | null
}): string {
  const configured = options.siteBaseUrl?.trim()
  if (configured) {
    return configured.replace(/\/$/, "")
  }

  const host = options.host?.trim()
  const proto = (options.proto?.trim() || "https").replace(/:$/, "")
  if (host && !looksLikePoisonedHost(host)) {
    return `${proto}://${host}`
  }

  const fromEnv = (options.envBaseUrl ?? envSiteBaseUrl()).trim().replace(/\/$/, "")
  if (fromEnv) {
    return fromEnv
  }

  return ""
}

export function looksLikePoisonedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h.includes("@") || h.includes(" ") || h.startsWith(".")) return true
  return false
}

export function buildDefaultRobotsTxt(baseUrl: string): string {
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /dashboard/",
    "Disallow: /next-api/",
    "",
    "User-agent: GPTBot",
    "User-agent: ChatGPT-User",
    "User-agent: ClaudeBot",
    "User-agent: PerplexityBot",
    "User-agent: Google-Extended",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /dashboard/",
    "Disallow: /next-api/",
    "",
  ]
  if (baseUrl) {
    lines.push(`Sitemap: ${baseUrl}/sitemap.xml`, "")
  }
  return lines.join("\n")
}

export function ensureRobotsHasSitemap(body: string, baseUrl: string): string {
  const trimmed = body.trim()
  if (!baseUrl || /^sitemap\s*:/im.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}\n\nSitemap: ${baseUrl}/sitemap.xml\n`
}

export function publicSitemapEntries(baseUrl: string) {
  if (!baseUrl) return []
  return [
    { url: baseUrl },
    { url: `${baseUrl}/privacy` },
    { url: `${baseUrl}/terms` },
  ]
}

/** Settings-shaped helper for resolveSiteBaseUrl callers in tests. */
export function siteBaseFromSettings(settings?: PublicSettings | null): string | undefined {
  return settings?.site_base_url
}
