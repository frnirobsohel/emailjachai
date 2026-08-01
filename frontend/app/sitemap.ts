import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getPublicSettings } from '@/lib/services/settings'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let baseUrl = ""
  try {
    const reqHeaders = await headers()
    const host = reqHeaders.get("x-forwarded-host") || reqHeaders.get("host")
    const proto = reqHeaders.get("x-forwarded-proto") || "https"
    if (host) {
      baseUrl = `${proto}://${host}`
    }
  } catch {
    // fallback
  }

  const settings = await getPublicSettings()
  if (settings?.site_base_url?.trim()) {
    baseUrl = settings.site_base_url.replace(/\/$/, '')
  }

  if (!baseUrl) {
    baseUrl = "https://emailjachai.pro"
  }
  
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/forgot-password`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ]
}
