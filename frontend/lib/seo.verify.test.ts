import { describe, expect, it } from "vitest"
import {
  buildDefaultRobotsTxt,
  ensureRobotsHasSitemap,
  pickSiteBaseUrl,
  publicSitemapEntries,
} from "@/lib/seo"
import {
  isPublicMarketingPath,
  parseHeadSnippet,
} from "@/lib/head-scripts"

const EXAMPLE = "https://example.com"

describe("manual verify checklist (automated)", () => {
  it("injects unwrapped FB preset JS (no nested script tags)", () => {
    const preset = `<script>\nfbq('init','YOUR_PIXEL_ID');\nfbq('track','PageView');\n</script>`
    const parsed = parseHeadSnippet(preset)
    expect(parsed.inlineScripts.join("")).toContain("fbq('init'")
    expect(parsed.inlineScripts.join("")).not.toContain("<script>")
  })

  it("blocks head scripts on admin/dashboard paths", () => {
    expect(isPublicMarketingPath("/")).toBe(true)
    expect(isPublicMarketingPath("/privacy")).toBe(true)
    expect(isPublicMarketingPath("/admin/brand-build")).toBe(false)
    expect(isPublicMarketingPath("/dashboard/jobs")).toBe(false)
  })

  it("default robots blocks admin/dashboard and points at sitemap", () => {
    const body = buildDefaultRobotsTxt(EXAMPLE)
    expect(body).toContain("Disallow: /admin/")
    expect(body).toContain("Disallow: /dashboard/")
    expect(body).toContain(`Sitemap: ${EXAMPLE}/sitemap.xml`)
  })

  it("custom robots keeps multi user-agent blocks and adds sitemap if missing", () => {
    const custom = [
      "User-agent: Googlebot",
      "User-agent: Bingbot",
      "Disallow: /private/",
      "",
      "User-agent: *",
      "Allow: /",
    ].join("\n")
    const out = ensureRobotsHasSitemap(custom, EXAMPLE)
    expect(out).toContain("User-agent: Googlebot")
    expect(out).toContain("User-agent: Bingbot")
    expect(out).toContain(`Sitemap: ${EXAMPLE}/sitemap.xml`)
  })

  it("sitemap only lists public marketing URLs", () => {
    const urls = publicSitemapEntries(EXAMPLE).map((e) => e.url)
    expect(urls).toEqual([
      EXAMPLE,
      `${EXAMPLE}/privacy`,
      `${EXAMPLE}/terms`,
    ])
    expect(urls.some((u) => u.includes("/login"))).toBe(false)
  })

  it("prefers site_base_url over request host and has no brand domain fallback", () => {
    expect(
      pickSiteBaseUrl({
        siteBaseUrl: `${EXAMPLE}/`,
        host: "evil.example",
        proto: "https",
      })
    ).toBe(EXAMPLE)

    expect(
      pickSiteBaseUrl({
        siteBaseUrl: "",
        host: null,
        proto: "https",
        envBaseUrl: "",
      })
    ).toBe("")
  })
})
