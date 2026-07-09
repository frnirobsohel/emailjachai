"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { resetPasswordSchema, ResetPasswordValues } from "@/features/auth/schemas/reset-password.schema"
import { cn } from "@/lib/utils"

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get("token")

    const [isLoading, setIsLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [shakeKey, setShakeKey] = useState(0)

    useEffect(() => {
        if (!token) {
            setError("Invalid or missing reset token.")
        }
    }, [token])

    const form = useForm<ResetPasswordValues>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            password: "",
            confirmPassword: "",
        }
    })

    function triggerShake() {
        setShakeKey(prev => prev + 1)
    }

    async function onSubmit(values: ResetPasswordValues) {
        setError(null)

        if (!token) {
            setError("Invalid or missing reset token.")
            triggerShake()
            return
        }

        setIsLoading(true)

        try {
            const res = await ApiClient.post('/auth/reset-password', { token, password: values.password })
            if (res.status === 'success') {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to reset password")
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
                        Password Reset
                    </CardTitle>
                    <CardDescription>
                        Your password has been successfully reset. You can now login with your new credentials.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button className="w-full" onClick={() => router.push("/login")}>
                        Go to Login
                    </Button>
                </CardContent>
                <CardFooter className="flex justify-center text-sm">
                    <Link href="/login" className="inline-flex items-center gap-1 underline font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                    </Link>
                </CardFooter>
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
                        <label htmlFor="password" className="text-sm font-medium leading-none">New Password</label>
                        <div className="relative">
                            <Input 
                                {...form.register("password")}
                                id="password" 
                                type={showPassword ? "text" : "password"} 
                                disabled={isLoading || !token} 
                                className={cn("pr-10", form.formState.errors.password && "border-red-500 focus-visible:ring-red-500")}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {form.formState.errors.password ? (
                            <span className="text-xs font-medium text-red-500 flex items-center gap-1 animate-in fade-in duration-150">
                                {form.formState.errors.password.message}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5 min-h-[72px]">
                        <label htmlFor="confirmPassword" className="text-sm font-medium leading-none">Confirm New Password</label>
                        <div className="relative">
                            <Input 
                                {...form.register("confirmPassword")}
                                id="confirmPassword" 
                                type={showConfirmPassword ? "text" : "password"} 
                                disabled={isLoading || !token} 
                                className={cn("pr-10", form.formState.errors.confirmPassword && "border-red-500 focus-visible:ring-red-500")}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors"
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {form.formState.errors.confirmPassword ? (
                            <span className="text-xs font-medium text-red-500 flex items-center gap-1 animate-in fade-in duration-150">
                                {form.formState.errors.confirmPassword.message}
                            </span>
                        ) : null}
                    </div>
                    <Button type="submit" className="w-full mt-1 font-medium shadow-sm" disabled={isLoading || !token}>
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Resetting...
                            </>
                        ) : (
                            "Reset Password"
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

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8">Loading...</div>}>
            <ResetPasswordForm />
        </Suspense>
    )
}
