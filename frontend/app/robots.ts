import { MetadataRoute } from 'next'
import { getPublicSettings } from '@/lib/services/settings'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getPublicSettings()
  const baseUrl = (settings?.site_base_url || 'https://emailjachai.pro').replace(/\/$/, '')

  if (settings?.use_custom_robots === "1" && settings?.custom_robots_txt?.trim()) {
    const lines = settings.custom_robots_txt.split('\n')
    const rules: Array<{ userAgent: string | string[]; allow?: string[]; disallow?: string[] }> = []
    let currentRule: { userAgent: string[]; allow: string[]; disallow: string[] } | null = null
    let customSitemap = `${baseUrl}/sitemap.xml`

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const [key, ...valParts] = trimmed.split(':')
      if (!key || valParts.length === 0) continue

      const k = key.trim().toLowerCase()
      const v = valParts.join(':').trim()

      if (k === 'user-agent') {
        if (currentRule && currentRule.userAgent.length > 0) {
          rules.push(currentRule)
        }
        currentRule = { userAgent: [v], allow: [], disallow: [] }
      } else if (k === 'allow' && currentRule) {
        currentRule.allow.push(v)
      } else if (k === 'disallow' && currentRule) {
        currentRule.disallow.push(v)
      } else if (k === 'sitemap') {
        customSitemap = v
      }
    }
    if (currentRule && currentRule.userAgent.length > 0) {
      rules.push(currentRule)
    }

    if (rules.length > 0) {
      return {
        rules,
        sitemap: customSitemap,
      }
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/dashboard/', '/next-api/'],
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'],
        allow: '/',
        disallow: ['/admin/', '/dashboard/', '/next-api/'],
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
