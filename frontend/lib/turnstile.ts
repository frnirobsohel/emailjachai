export const CAPTCHA_ERROR_CODE = "ERR_CAPTCHA"

type ApiErrorBody = {
    code?: unknown
    message?: unknown
}

function readErrorBody(source: unknown): ApiErrorBody | null {
    if (!source || typeof source !== "object") return null

    const record = source as {
        code?: unknown
        message?: unknown
        apiErrorCode?: unknown
        response?: { data?: ApiErrorBody }
    }

    if (record.response?.data && typeof record.response.data === "object") {
        return record.response.data
    }

    return {
        code: record.apiErrorCode ?? record.code,
        message: record.message,
    }
}

/** Reads backend `code` from an ApiResponse-like object or an Axios/enriched Error. */
export function getApiErrorCode(source: unknown): string | undefined {
    const body = readErrorBody(source)
    return typeof body?.code === "string" ? body.code : undefined
}

export function getApiErrorMessage(source: unknown, fallback = "An unexpected error occurred"): string {
    const body = readErrorBody(source)
    if (typeof body?.message === "string" && body.message.trim()) {
        return body.message
    }
    if (source instanceof Error && source.message.trim()) {
        return source.message
    }
    return fallback
}

/** True when the backend rejected the request for Turnstile/captcha reasons. */
export function isCaptchaError(source: unknown): boolean {
    if (getApiErrorCode(source) === CAPTCHA_ERROR_CODE) {
        return true
    }

    const message = getApiErrorMessage(source, "").toLowerCase()
    return message.includes("captcha")
}

export interface TurnstilePublicConfig {
    siteKey: string
    isRequired: boolean
}

type SettingsMap = Record<string, string>

/**
 * Loads Turnstile public config from /settings/public.
 * Used when SSR settings were empty so the UI can still recover a captcha challenge.
 */
export async function fetchTurnstileConfig(
    getSettings: () => Promise<{ status: string; data?: SettingsMap }>
): Promise<TurnstilePublicConfig | null> {
    try {
        const res = await getSettings()
        if (res.status !== "success" || !res.data) return null

        return {
            siteKey: (res.data.turnstile_site_key || "").trim(),
            isRequired: res.data.turnstile_required === "1",
        }
    } catch {
        return null
    }
}
