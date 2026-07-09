"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

export function ContactForm() {
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
            // Mock API submission. For production, this will point to /api/v1/contact or server action.
            await new Promise((resolve) => setTimeout(resolve, 1000))
            
            setSubmitStatus("success")
            setStatusMessage("Thank you! Your message has been sent successfully.")
            setName("")
            setEmail("")
            setSubject("")
            setMessage("")
        } catch (error) {
            setSubmitStatus("error")
            setStatusMessage("Failed to send message. Please try again later.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="p-6 sm:p-8 rounded-2xl border border-white/5 bg-white/[0.01]">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="contact-name" className="block text-sm font-medium text-slate-400 mb-1.5">
                            Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="contact-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                        />
                    </div>
                    <div>
                        <label htmlFor="contact-email" className="block text-sm font-medium text-slate-400 mb-1.5">
                            Email <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="contact-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-400 mb-1.5">Subject</label>
                    <input
                        id="contact-subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="How can we help?"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                    />
                </div>
                <div>
                    <label htmlFor="contact-message" className="block text-sm font-medium text-slate-400 mb-1.5">
                        Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        id="contact-message"
                        required
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us more..."
                        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors resize-none"
                    />
                </div>

                {submitStatus && (
                    <div className={`p-3.5 rounded-xl text-sm ${submitStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {statusMessage}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLoading ? "Sending..." : "Send Message"}
                </button>
            </form>
        </div>
    )
}
