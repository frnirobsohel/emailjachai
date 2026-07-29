"use client"

import { useEffect, useRef } from "react"

declare global {
    interface Window {
        turnstile?: {
            render: (
                el: HTMLElement,
                options: {
                    sitekey: string
                    callback: (token: string) => void
                    "expired-callback"?: () => void
                    "error-callback"?: () => void
                    theme?: "light" | "dark" | "auto"
                    size?: "normal" | "compact" | "flexible"
                }
            ) => string
            reset: (widgetId?: string) => void
            remove: (widgetId?: string) => void
        }
    }
}

type TurnstileWidgetProps = {
    siteKey: string
    resetKey: number
    onToken: (token: string | null) => void
}

const SCRIPT_ID = "cf-turnstile-script"
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

function loadTurnstileScript(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve()
    if (window.turnstile) return Promise.resolve()

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
        return new Promise((resolve, reject) => {
            if (window.turnstile) {
                resolve()
                return
            }
            existing.addEventListener("load", () => resolve())
            existing.addEventListener("error", () => reject(new Error("Turnstile script failed")))
        })
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.id = SCRIPT_ID
        script.src = SCRIPT_SRC
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error("Turnstile script failed"))
        document.head.appendChild(script)
    })
}

export function TurnstileWidget({ siteKey, resetKey, onToken }: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const onTokenRef = useRef(onToken)

    useEffect(() => {
        onTokenRef.current = onToken
    }, [onToken])

    useEffect(() => {
        let cancelled = false

        const mount = async () => {
            if (!siteKey || !containerRef.current) return
            onTokenRef.current(null)

            try {
                await loadTurnstileScript()
                if (cancelled || !containerRef.current || !window.turnstile) return

                if (widgetIdRef.current) {
                    window.turnstile.remove(widgetIdRef.current)
                    widgetIdRef.current = null
                }

                containerRef.current.innerHTML = ""
                widgetIdRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    theme: "light",
                    size: "flexible",
                    callback: (token) => onTokenRef.current(token),
                    "expired-callback": () => onTokenRef.current(null),
                    "error-callback": () => onTokenRef.current(null),
                })
            } catch {
                onTokenRef.current(null)
            }
        }

        mount()

        return () => {
            cancelled = true
            if (widgetIdRef.current && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current)
                widgetIdRef.current = null
            }
        }
    }, [siteKey, resetKey])

    return <div ref={containerRef} className="flex min-h-[65px] w-full justify-center" />
}
