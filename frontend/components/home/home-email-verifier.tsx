"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { verifyEmailPublic } from "@/actions/public-verify"
import { Loader2 } from "lucide-react"

export function HomeEmailVerifier() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState<string | null>(null)
    const [usageCount, setUsageCount] = useState<number>(0)

    useEffect(() => {
        // Load the count from local storage on mount
        const storedCount = localStorage.getItem("ejp_public_verify_count")
        if (storedCount) {
            setUsageCount(parseInt(storedCount, 10))
        }
    }, [])

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        // Check limit
        if (usageCount >= 15) {
            router.push("/register")
            return
        }

        setIsLoading(true)
        setStatus(null)

        try {
            const res = await verifyEmailPublic(email)
            
            // We assume the backend returns something like { status: 'success', data: { result: 'Valid' } }
            // Adjust this according to the actual backend response format
            if (res?.status === 'success' && res.data) {
                setStatus(res.data.result || res.data.status || 'Verified')
                
                // Only increment usage count on a successful API request
                const newCount = usageCount + 1
                setUsageCount(newCount)
                localStorage.setItem("ejp_public_verify_count", newCount.toString())
            } else if (res?.status === 'error') {
                setStatus(res.message || 'Error')
            } else {
                setStatus(res?.result || 'Unknown')
            }

        } catch (error) {
            setStatus('Error connecting to server')
        } finally {
            setIsLoading(false)
        }
    }

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value)
        if (status !== null) {
            setStatus(null) // Reset status on typing
        }
    }

    // Determine button text and styles based on state
    let buttonText = "Verify Now"
    let buttonStyle = "bg-indigo-600 text-slate-200 shadow-indigo-600/20 hover:bg-indigo-500"

    if (isLoading) {
        buttonText = "Verifying..."
        buttonStyle = "bg-indigo-500/50 text-slate-300 cursor-wait"
    } else if (status) {
        buttonText = status
        // Add dynamic styling based on result if desired, keeping it simple for now
        if (status.toLowerCase().includes('valid') && !status.toLowerCase().includes('invalid')) {
            buttonStyle = "bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500"
        } else if (status.toLowerCase().includes('invalid') || status.toLowerCase().includes('error')) {
            buttonStyle = "bg-rose-600 text-white shadow-rose-600/20 hover:bg-rose-500"
        } else {
            buttonStyle = "bg-amber-600 text-white shadow-amber-600/20 hover:bg-amber-500"
        }
    }

    return (
        <form onSubmit={handleVerify} className="max-w-xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3 p-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl shadow-black/20 transition-all duration-300">
                <div className="relative flex-1">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={handleEmailChange}
                        placeholder="Enter email address to verify..."
                        className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/5 border-0 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-base transition-colors"
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !email || status !== null}
                    className={`flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base shadow-lg transition-all hover:-translate-y-0.5 whitespace-nowrap disabled:opacity-70 disabled:hover:translate-y-0 disabled:cursor-not-allowed ${buttonStyle}`}
                >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {!isLoading && status === null && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                    )}
                    {buttonText}
                </button>
            </div>
            <div className="flex items-center justify-between mt-4 px-2">
                <p className="text-xs text-slate-500">
                    🔒 Free to try — No credit card required.
                </p>
                <p className="text-xs text-slate-500">
                    {Math.max(0, 15 - usageCount)} free verifications left
                </p>
            </div>
        </form>
    )
}
