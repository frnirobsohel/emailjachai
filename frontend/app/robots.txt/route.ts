import { getPublicSettings } from "@/lib/services/settings"
import { resolveSiteBaseUrl } from "@/lib/site-url"
import { buildDefaultRobotsTxt, ensureRobotsHasSitemap } from "@/lib/seo"

/**
 * Serve robots.txt as plain text so custom admin rules keep full fidelity
 * (multi User-agent blocks, Crawl-delay, comments, etc.).
 */
export async function GET() {
  const settings = await getPublicSettings()
  const baseUrl = await resolveSiteBaseUrl(settings)

  const useCustom =
    settings?.use_custom_robots === "1" &&
    Boolean(settings?.custom_robots_txt?.trim())

  const body =
    useCustom && settings?.custom_robots_txt
      ? ensureRobotsHasSitemap(settings.custom_robots_txt, baseUrl)
      : buildDefaultRobotsTxt(baseUrl)

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  })
}
