"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get("token")

    const [isLoading, setIsLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!token) {
            setError("Invalid or missing reset token.")
        }
    }, [token])

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)

        if (!token) {
            setError("Invalid or missing reset token.")
            return
        }

        const formData = new FormData(event.currentTarget)
        const password = formData.get("password") as string
        const confirmPassword = formData.get("confirmPassword") as string

        if (password !== confirmPassword) {
            setError("Passwords do not match.")
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters long.")
            return
        }

        setIsLoading(true)

        try {
            const res = await ApiClient.post('/auth/reset-password', { token, password })
            if (res.status === 'success') {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to reset password")
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    if (submitted) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                        Password Reset
                    </CardTitle>
                    <CardDescription>
                        Your password has been reset successfully.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500">
                        You can now use your new password to log in to your account.
                    </p>
                    <Link href="/login" className="w-full inline-flex justify-center items-center rounded-md bg-[#0f172b] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#0f172b]/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                        Proceed to Login
                    </Link>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl">Reset Password</CardTitle>
                <CardDescription>
                    Enter your new password below.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={onSubmit} className="grid gap-4">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                            {error}
                        </div>
                    )}
                    <div className="grid gap-2">
                        <label htmlFor="password" className="text-sm font-medium">New Password</label>
                        <Input id="password" name="password" type="password" required disabled={!token} />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm New Password</label>
                        <Input id="confirmPassword" name="confirmPassword" type="password" required disabled={!token} />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || !token}>
                        {isLoading ? "Resetting..." : "Reset Password"}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
                <Link href="/login" className="inline-flex items-center gap-1 underline font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                </Link>
                <span className="text-slate-300 dark:text-slate-700 mx-1">•</span>
                <Link href="/" className="inline-flex items-center gap-1 hover:underline text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
                    Back to Home
                </Link>
            </CardFooter>
        </Card>
    )
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
            <ResetPasswordForm />
        </Suspense>
    )
}
