"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useSettings } from "@/lib/settings-context"

export function HomeEmailVerifier() {
    const router = useRouter()
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [limit, setLimit] = useState<number | null>(() => {
        if (typeof window !== "undefined") {
            const cached = localStorage.getItem("free_verify_limit")
            return cached ? Number(cached) : null
        }
        return null
    })
    const [remaining, setRemaining] = useState<number | null>(() => {
        if (typeof window !== "undefined") {
            const cached = localStorage.getItem("free_verify_remaining")
            return cached ? Number(cached) : null
        }
        return null
    })
    const [isInitializing, setIsInitializing] = useState(true)

    const fetchStatus = async () => {
        try {
            const res = await ApiClient.get<{ limit: number; remaining: number }>("/jobs/verify-public/status", {
                withCredentials: true,
            })
            if (res.status === "success" && res.data) {
                setLimit(res.data.limit)
                setRemaining(res.data.remaining)
                localStorage.setItem("free_verify_limit", String(res.data.limit))
                localStorage.setItem("free_verify_remaining", String(res.data.remaining))
            }
        } catch {
            console.error("Failed to load verifier status")
        } finally {
            setIsInitializing(false)
        }
    }

    useEffect(() => {
        fetchStatus()
    }, [])

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim() || isMaintenance) return

        if (!isInitializing && remaining !== null && remaining <= 0) {
            router.push("/register")
            return
        }

        setIsLoading(true)
        setStatus(null)

        try {
            const res = await ApiClient.post<{ status?: string }>(
                "/jobs/verify-public",
                { email },
                {
                    withCredentials: true,
                    timeout: 60000,
                }
            )

            if (res?.status === "success" && res.data) {
                setStatus(res.data.status || "Verified")
                fetchStatus()
            } else if (res?.status === "error") {
                setStatus(res.message || "Error")
            } else {
                setStatus(res?.message || "Unknown")
            }
        } catch (error: unknown) {
            setStatus(error instanceof Error ? error.message : "Error connecting to server")
        } finally {
            setIsLoading(false)
        }
    }

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value)
        if (status !== null) setStatus(null)
    }

    let buttonText = "Verify Now"
    let buttonStyle = "border border-[#08352f] bg-[var(--accent,#0f5c52)] text-white hover:bg-[var(--accent-hover,#0b4a42)]"

    if (isMaintenance) {
        buttonText = "Maintenance Active"
        buttonStyle = "border border-amber-950/40 bg-amber-700 text-white cursor-not-allowed opacity-80"
    } else if (isLoading) {
        buttonText = "Verifying..."
        buttonStyle = "border border-[#08352f]/70 bg-[var(--accent,#0f5c52)]/70 text-white cursor-wait"
    } else if (status) {
        buttonText = status
        const s = status.toLowerCase()
        if (s.includes("valid") && !s.includes("invalid")) {
            buttonStyle = "border border-emerald-950/40 bg-emerald-700 text-white landing-result-pop"
        } else if (s.includes("invalid") || s.includes("error")) {
            buttonStyle = "border border-rose-950/40 bg-rose-700 text-white landing-result-pop"
        } else {
            buttonStyle = "border border-amber-950/40 bg-amber-700 text-white landing-result-pop"
        }
    }

    return (
        <form onSubmit={handleVerify} className="mx-auto w-full max-w-xl">
            <div className="flex flex-col gap-3 rounded-md border border-[#0b1f1c]/10 bg-white/80 p-2 shadow-[0_12px_40px_-20px_rgba(11,31,28,0.35)] backdrop-blur-sm sm:flex-row sm:items-center sm:gap-2">
                <div className="relative min-w-0 flex-1">
                    <svg
                        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8aa099]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                        />
                    </svg>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={handleEmailChange}
                        placeholder={
                            isMaintenance
                                ? settings?.maintenance_message || "System under maintenance..."
                                : "Enter email address to verify..."
                        }
                        className="w-full rounded-md border-0 bg-transparent py-3.5 pl-12 pr-4 text-base text-[var(--ink,#0b1f1c)] placeholder:text-[#8aa099] focus:outline-none focus:ring-2 focus:ring-[var(--accent,#0f5c52)]/25 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isLoading || isMaintenance}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !email || isMaintenance}
                    className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-md px-7 py-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto ${buttonStyle}`}
                >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {buttonText}
                </button>
            </div>

            <div className="mt-4 flex flex-col gap-1 px-1 text-xs text-[var(--muted-soft,#6b857c)] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p>Free to try — no credit card required.</p>
                <p className="min-h-[16px] tabular-nums sm:shrink-0 sm:text-right" suppressHydrationWarning>
                    {remaining !== null && limit !== null
                        ? `${remaining} of ${limit} free today`
                        : remaining !== null
                          ? `${remaining} left today`
                          : " "}
                </p>
            </div>
        </form>
    )
}
