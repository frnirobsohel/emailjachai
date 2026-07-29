const TZ_COOKIE = "ejp_tz"

/**
 * Browser IANA timezone (e.g. America/New_York). Falls back to UTC.
 */
export function getBrowserTimeZone(): string {
    if (typeof Intl === "undefined") return "UTC"
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
        return "UTC"
    }
}

/** Persist tz for SSR (fetchServer reads this cookie). */
export function syncTimeZoneCookie(tz = getBrowserTimeZone()): void {
    if (typeof document === "undefined") return
    const safe = encodeURIComponent(tz)
    document.cookie = `${TZ_COOKIE}=${safe}; path=/; max-age=31536000; SameSite=Lax`
}

/** Append ?tz= / &tz= for dashboard stats requests. */
export function withTimeZoneQuery(path: string, tz = getBrowserTimeZone()): string {
    const sep = path.includes("?") ? "&" : "?"
    return `${path}${sep}tz=${encodeURIComponent(tz)}`
}

export { TZ_COOKIE }
