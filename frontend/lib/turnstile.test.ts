import { describe, it, expect, vi } from "vitest"
import {
    CAPTCHA_ERROR_CODE,
    fetchTurnstileConfig,
    getApiErrorCode,
    getApiErrorMessage,
    isCaptchaError,
} from "./turnstile"

describe("isCaptchaError", () => {
    it("detects ERR_CAPTCHA on ApiResponse-shaped objects", () => {
        expect(
            isCaptchaError({
                status: "error",
                code: CAPTCHA_ERROR_CODE,
                message: "Captcha verification failed",
            })
        ).toBe(true)
    })

    it("detects ERR_CAPTCHA on Axios-shaped errors", () => {
        expect(
            isCaptchaError({
                message: "Request failed",
                response: {
                    data: {
                        code: CAPTCHA_ERROR_CODE,
                        message: "Captcha verification failed",
                    },
                },
            })
        ).toBe(true)
    })

    it("detects captcha via enriched apiErrorCode", () => {
        expect(
            isCaptchaError({
                apiErrorCode: CAPTCHA_ERROR_CODE,
                message: "Captcha verification failed",
            })
        ).toBe(true)
    })

    it("falls back to message text when code is missing", () => {
        expect(isCaptchaError({ message: "Captcha verification failed" })).toBe(true)
        expect(isCaptchaError(new Error("captcha token is required"))).toBe(true)
    })

    it("returns false for unrelated errors", () => {
        expect(isCaptchaError({ code: "ERR_INVALID_REQUEST", message: "Bad input" })).toBe(false)
        expect(isCaptchaError(new Error("Network down"))).toBe(false)
        expect(isCaptchaError(null)).toBe(false)
    })
})

describe("getApiErrorCode / getApiErrorMessage", () => {
    it("reads code and message from response body", () => {
        const err = {
            response: {
                data: { code: "ERR_CAPTCHA", message: "Captcha verification failed" },
            },
        }
        expect(getApiErrorCode(err)).toBe("ERR_CAPTCHA")
        expect(getApiErrorMessage(err)).toBe("Captcha verification failed")
    })

    it("uses fallback message when missing", () => {
        expect(getApiErrorMessage({}, "fallback")).toBe("fallback")
    })
})

describe("fetchTurnstileConfig", () => {
    it("returns site key and required flag from public settings", async () => {
        const getSettings = vi.fn().mockResolvedValue({
            status: "success",
            data: {
                turnstile_site_key: "site-key",
                turnstile_required: "1",
            },
        })

        await expect(fetchTurnstileConfig(getSettings)).resolves.toEqual({
            siteKey: "site-key",
            isRequired: true,
        })
    })

    it("returns null when settings request fails", async () => {
        const getSettings = vi.fn().mockRejectedValue(new Error("offline"))
        await expect(fetchTurnstileConfig(getSettings)).resolves.toBeNull()
    })

    it("returns null when payload is unsuccessful", async () => {
        const getSettings = vi.fn().mockResolvedValue({ status: "error" })
        await expect(fetchTurnstileConfig(getSettings)).resolves.toBeNull()
    })
})
