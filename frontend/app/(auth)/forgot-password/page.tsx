"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { forgotPasswordSchema, ForgotPasswordValues } from "@/features/auth/schemas/forgot-password.schema"
import { cn } from "@/lib/utils"

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [shakeKey, setShakeKey] = useState(0)

    const form = useForm<ForgotPasswordValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: "",
        }
    })

    function triggerShake() {
        setShakeKey(prev => prev + 1)
    }

    async function onSubmit(values: ForgotPasswordValues) {
        setError(null)
        setIsLoading(true)

        try {
            const res = await ApiClient.post('/auth/forgot-password', values)
            if (res.status === 'success') {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to send reset link")
                triggerShake()
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred")
            triggerShake()
        } finally {
            setIsLoading(false)
        }
    }

    function onInvalid() {
        triggerShake()
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

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl">Forgot Password</CardTitle>
                <CardDescription>
                    Enter your email address and we&apos;ll send you a link to reset your password.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form 
                    key={shakeKey}
                    onSubmit={form.handleSubmit(onSubmit, onInvalid)} 
                    className={cn("grid gap-4 transition-all duration-200", shakeKey > 0 && "animate-error-shake")}
                >
                    {error && (
                        <div className="rounded-lg border border-red-500/30 bg-red-50/90 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/50 dark:text-red-300 flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            <span className="font-medium leading-tight">{error}</span>
                        </div>
                    )}
                    <div className="flex flex-col gap-1.5 min-h-[72px]">
                        <label htmlFor="email" className="text-sm font-medium leading-none">Email</label>
                        <Input 
                            {...form.register("email")}
                            id="email" 
                            type="email" 
                            placeholder="m@example.com" 
                            autoComplete="email" 
                            disabled={isLoading}
                            className={cn(form.formState.errors.email && "border-red-500 focus-visible:ring-red-500")}
                        />
                        {form.formState.errors.email ? (
                            <span className="text-xs font-medium text-red-500 flex items-center gap-1 animate-in fade-in duration-150">
                                {form.formState.errors.email.message}
                            </span>
                        ) : null}
                    </div>
                    <Button type="submit" className="w-full mt-1 font-medium shadow-sm" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending link...
                            </>
                        ) : (
                            "Send Reset Link"
                        )}
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
