"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useSettings } from "@/lib/settings-context"
import { TurnstileWidget } from "@/components/home/turnstile-widget"
import {
    fetchTurnstileConfig,
    getApiErrorMessage,
    isCaptchaError,
} from "@/lib/turnstile"

interface ContactFormProps {
    supportConfigured?: boolean
}

export function ContactForm({ supportConfigured = true }: ContactFormProps) {
    const settings = useSettings()
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [subject, setSubject] = useState("")
    const [message, setMessage] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null)
    const [statusMessage, setStatusMessage] = useState("")
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
    const [turnstileResetKey, setTurnstileResetKey] = useState(0)
    const [isCaptchaVisible, setIsCaptchaVisible] = useState(false)
    const [turnstileSiteKey, setTurnstileSiteKey] = useState(
        () => settings?.turnstile_site_key || ""
    )
    const [turnstileRequired, setTurnstileRequired] = useState(
        () => settings?.turnstile_required === "1"
    )

    const isLoadingRef = useRef(false)
    const isPendingCaptchaRef = useRef(false)
    const turnstileSiteKeyRef = useRef(turnstileSiteKey)
    const formRef = useRef({ name, email, subject, message })

    useEffect(() => {
        formRef.current = { name, email, subject, message }
    }, [name, email, subject, message])

    useEffect(() => {
        turnstileSiteKeyRef.current = turnstileSiteKey
    }, [turnstileSiteKey])

    useEffect(() => {
        if (settings?.turnstile_site_key) {
            setTurnstileSiteKey(settings.turnstile_site_key)
        }
        if (settings?.turnstile_required !== undefined) {
            setTurnstileRequired(settings.turnstile_required === "1")
        }
    }, [settings?.turnstile_site_key, settings?.turnstile_required])

    // Fallback when SSR public settings were empty — still learn Turnstile config from API.
    useEffect(() => {
        if (turnstileSiteKey && turnstileRequired) return

        let cancelled = false
        void (async () => {
            const config = await fetchTurnstileConfig(() =>
                ApiClient.get<Record<string, string>>("/settings/public")
            )
            if (cancelled || !config) return
            if (config.siteKey) setTurnstileSiteKey(config.siteKey)
            if (config.isRequired) setTurnstileRequired(true)
        })()

        return () => {
            cancelled = true
        }
        // Mount-only bootstrap; settings effect above covers later hydration.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount fallback
    }, [])

    const needsCaptcha = turnstileRequired && Boolean(turnstileSiteKey)

    const recoverCaptchaChallenge = async () => {
        setTurnstileToken(null)
        setTurnstileRequired(true)

        let siteKey = turnstileSiteKeyRef.current
        if (!siteKey) {
            const config = await fetchTurnstileConfig(() =>
                ApiClient.get<Record<string, string>>("/settings/public")
            )
            if (config?.siteKey) {
                siteKey = config.siteKey
                setTurnstileSiteKey(config.siteKey)
            }
        }

        if (siteKey) {
            setIsCaptchaVisible(true)
            setTurnstileResetKey((k) => k + 1)
            isPendingCaptchaRef.current = true
            return
        }

        setIsCaptchaVisible(false)
        isPendingCaptchaRef.current = false
    }

    const submitContact = async (token: string | null) => {
        if (isLoadingRef.current) return

        const current = formRef.current
        const trimmedName = current.name.trim()
        const trimmedEmail = current.email.trim()
        const trimmedSubject = current.subject.trim()
        const trimmedMessage = current.message.trim()

        if (!trimmedName || !trimmedEmail || !trimmedMessage) {
            setSubmitStatus("error")
            setStatusMessage("Please fill in all required fields.")
            setIsCaptchaVisible(false)
            isPendingCaptchaRef.current = false
            return
        }

        isLoadingRef.current = true
        isPendingCaptchaRef.current = false
        setIsLoading(true)
        setSubmitStatus(null)

        try {
            const result = await ApiClient.post("/contact", {
                name: trimmedName,
                email: trimmedEmail,
                subject: trimmedSubject,
                message: trimmedMessage,
                turnstile_token: token || "",
            })

            if (result.status === "success") {
                setSubmitStatus("success")
                setStatusMessage("Thank you! Your message has been sent successfully.")
                setName("")
                setEmail("")
                setSubject("")
                setMessage("")
                setTurnstileToken(null)
                setIsCaptchaVisible(false)
            } else {
                const messageText = result.message || "Failed to send message. Please try again later."
                setSubmitStatus("error")
                setStatusMessage(messageText)
                if (isCaptchaError(result)) {
                    await recoverCaptchaChallenge()
                } else {
                    setTurnstileToken(null)
                    setIsCaptchaVisible(false)
                }
            }
        } catch (error: unknown) {
            setSubmitStatus("error")
            setStatusMessage(
                getApiErrorMessage(error, "Failed to send message. Please try again later.")
            )
            if (isCaptchaError(error)) {
                await recoverCaptchaChallenge()
            } else {
                setTurnstileToken(null)
                setIsCaptchaVisible(false)
            }
        } finally {
            isLoadingRef.current = false
            setIsLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isLoadingRef.current) return

        if (!name.trim() || !email.trim() || !message.trim()) {
            setSubmitStatus("error")
            setStatusMessage("Please fill in all required fields.")
            return
        }

        if (needsCaptcha && !turnstileToken) {
            isPendingCaptchaRef.current = true
            setIsCaptchaVisible(true)
            setSubmitStatus(null)
            setStatusMessage("")
            return
        }

        await submitContact(turnstileToken)
    }

    const handleTurnstileToken = (token: string | null) => {
        setTurnstileToken(token)
        if (token && isPendingCaptchaRef.current) {
            void submitContact(token)
        }
    }

    const fieldClass =
        "w-full border border-[#0b1f1c]/12 bg-white px-3 py-2.5 text-sm text-[#0b1f1c] placeholder:text-[#8aa099] focus:border-[#0f5c52] focus:outline-none"

    if (!supportConfigured) {
        return (
            <div className="border border-[#0b1f1c]/10 bg-white p-6 text-sm text-[#4a635c] sm:p-8">
                Contact form is temporarily unavailable. Please try again later.
            </div>
        )
    }

    let buttonText = "Send Message"
    if (isLoading) {
        buttonText = "Sending..."
    } else if (isCaptchaVisible && !turnstileToken) {
        buttonText = "Complete check"
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 border border-[#0b1f1c]/10 bg-white p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-[#3d564f]">
                        Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                        id="contact-name"
                        type="text"
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className={fieldClass}
                        disabled={isLoading}
                    />
                </div>
                <div>
                    <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-[#3d564f]">
                        Email <span className="text-rose-600">*</span>
                    </label>
                    <input
                        id="contact-email"
                        type="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={fieldClass}
                        disabled={isLoading}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-medium text-[#3d564f]">
                    Subject
                </label>
                <input
                    id="contact-subject"
                    type="text"
                    maxLength={200}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="How can we help?"
                    className={fieldClass}
                    disabled={isLoading}
                />
            </div>
            <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-[#3d564f]">
                    Message <span className="text-rose-600">*</span>
                </label>
                <textarea
                    id="contact-message"
                    required
                    rows={4}
                    maxLength={5000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us more..."
                    className={`${fieldClass} resize-none`}
                    disabled={isLoading}
                />
            </div>

            {needsCaptcha && isCaptchaVisible && (
                <div className="space-y-2">
                    <TurnstileWidget
                        siteKey={turnstileSiteKey}
                        resetKey={turnstileResetKey}
                        onToken={handleTurnstileToken}
                    />
                    {!turnstileToken && (
                        <p className="text-center text-xs text-[#6b857c]">
                            Complete the check to send your message.
                        </p>
                    )}
                </div>
            )}

            {submitStatus && (
                <div
                    className={`p-3 text-sm ${
                        submitStatus === "success"
                            ? "border border-emerald-700/20 bg-emerald-50 text-emerald-800"
                            : "border border-rose-700/20 bg-rose-50 text-rose-800"
                    }`}
                >
                    {statusMessage}
                </div>
            )}

            <button
                type="submit"
                disabled={isLoading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#08352f] bg-[#0f5c52] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0b4a42] disabled:opacity-50"
            >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {buttonText}
            </button>
        </form>
    )
}
