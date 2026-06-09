"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/common/card"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { ApiClient } from "@/lib/api-client"

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError(null)
        setIsLoading(true)

        const formData = new FormData(event.currentTarget)
        const email = formData.get("email") as string

        try {
            const res = await ApiClient.post('/auth/forgot-password', { email })
            if (res.status === 'success') {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to send reset link")
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
                        Check your email
                    </CardTitle>
                    <CardDescription>
                        We've sent a password reset link to your email address.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500">
                        Didn't receive the email? Check your spam folder or try again.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
                        Try another email
                    </Button>
                </CardContent>
                <CardFooter>
                    <Link href="/login" className="flex items-center text-sm underline text-slate-500 hover:text-slate-900">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                    </Link>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl">Forgot Password</CardTitle>
                <CardDescription>
                    Enter your email address and we&apos;ll send you a link to reset your password.
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
                        <label htmlFor="email" className="text-sm font-medium">Email</label>
                        <Input id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Sending link..." : "Send Reset Link"}
                    </Button>
                </form>
            </CardContent>
            <CardFooter>
                <Link href="/login" className="flex items-center text-sm underline text-slate-500 hover:text-slate-900">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Link>
            </CardFooter>
        </Card>
    )
}
