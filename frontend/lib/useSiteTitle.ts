/**
 * useSiteTitle — A shared hook to get the site title.
 * 1. Immediately reads from localStorage (no flash).
 * 2. Fetches fresh value from API in background.
 * 3. Updates both state and localStorage cache.
 */
import { useState, useEffect } from "react"
import { ApiClient } from "@/lib/api-client"

const CACHE_KEY = 'sidebar_site_title'
const DEFAULT_TITLE = 'EmailJachai Pro'

export function useSiteTitle(): string {
    const [siteTitle, setSiteTitle] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(CACHE_KEY) || DEFAULT_TITLE
        }
        return DEFAULT_TITLE
    })

    useEffect(() => {
        const fetchTitle = async () => {
            try {
                const result = await ApiClient.get('/settings/public')
                if (result.status === 'success' && result.data) {
                    const data = result.data as Record<string, string>
                    if (data.site_title) {
                        setSiteTitle(data.site_title)
                        localStorage.setItem(CACHE_KEY, data.site_title)
                        document.title = data.site_title
                    }
                }
            } catch {
                // Silently fall back to cached value
            }
        }
        fetchTitle()
    }, [])

    return siteTitle
}
