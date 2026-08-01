"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"

interface ContactFormProps {
    supportConfigured?: boolean
}

export function ContactForm({ supportConfigured = true }: ContactFormProps) {
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [subject, setSubject] = useState("")
    const [message, setMessage] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null)
    const [statusMessage, setStatusMessage] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !email || !message) {
            setSubmitStatus("error")
            setStatusMessage("Please fill in all required fields.")
            return
        }

        setIsLoading(true)
        setSubmitStatus(null)

        try {
            const result = await ApiClient.post("/contact", {
                name: name.trim(),
                email: email.trim(),
                subject: subject.trim(),
                message: message.trim(),
            })

            if (result.status === "success") {
                setSubmitStatus("success")
                setStatusMessage("Thank you! Your message has been sent successfully.")
                setName("")
                setEmail("")
                setSubject("")
                setMessage("")
            } else {
                setSubmitStatus("error")
                setStatusMessage(result.message || "Failed to send message. Please try again later.")
            }
        } catch (error: unknown) {
            setSubmitStatus("error")
            setStatusMessage(error instanceof Error ? error.message : "Failed to send message. Please try again later.")
        } finally {
            setIsLoading(false)
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
                />
            </div>

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
                {isLoading ? "Sending..." : "Send Message"}
            </button>
        </form>
    )
}
