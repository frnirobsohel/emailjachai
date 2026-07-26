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

const cardClass =
    "border-[#0b1f1c]/10 bg-white/90 shadow-[0_16px_48px_-24px_rgba(11,31,28,0.35)] backdrop-blur-sm"

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [shake, setShake] = useState(false)

    const form = useForm<ForgotPasswordValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: "",
        },
    })

    function triggerShake() {
        setShake(false)
        requestAnimationFrame(() => setShake(true))
    }

    async function onSubmit(values: ForgotPasswordValues) {
        setError(null)
        setIsLoading(true)

        try {
            const res = await ApiClient.post("/auth/forgot-password", values)
            if (res.status === "success") {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to send reset link")
                triggerShake()
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred")
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
            <Card className={cardClass}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[#0b1f1c]">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                        Check your email
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        We&apos;ve sent a password reset link to your email address.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-[#5a736c]">
                        Didn&apos;t receive the email? Check your spam folder or try again.
                    </p>
                    <Button
                        variant="outline"
                        className="w-full rounded-md border-[#0b1f1c]/20 text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                        onClick={() => setSubmitted(false)}
                    >
                        Try another email
                    </Button>
                </CardContent>
                <CardFooter className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-[#4a635c]">
                    <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                    </Link>
                    <span className="mx-1 text-[#0b1f1c]/20">•</span>
                    <Link href="/" className="text-[#5a736c] transition-colors hover:text-[#0b1f1c]">
                        Back to Home
                    </Link>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className={cardClass}>
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-2xl tracking-tight text-[#0b1f1c]">Forgot Password</CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                    className={cn("grid gap-4", shake && "animate-error-shake")}
                    onAnimationEnd={() => setShake(false)}
                >
                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2.5 rounded-md border border-rose-700/20 bg-rose-50 p-3 text-sm text-rose-800"
                        >
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                            <span className="font-medium leading-tight">{error}</span>
                        </div>
                    )}
                    <div className="flex min-h-[72px] flex-col gap-1.5">
                        <label htmlFor="email" className="text-sm font-medium leading-none text-[#3d564f]">
                            Email
                        </label>
                        <Input
                            {...form.register("email")}
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            disabled={isLoading}
                            className={cn(
                                "border-[#0b1f1c]/12 focus-visible:ring-[#0f5c52]/30",
                                form.formState.errors.email && "border-rose-500 focus-visible:ring-rose-500"
                            )}
                        />
                        {form.formState.errors.email ? (
                            <span className="text-xs font-medium text-rose-600">
                                {form.formState.errors.email.message}
                            </span>
                        ) : null}
                    </div>
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="mt-1 w-full rounded-md border border-[#08352f] bg-[#0f5c52] font-semibold text-white shadow-none hover:bg-[#0b4a42]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending link...
                            </>
                        ) : (
                            "Send Reset Link"
                        )}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-[#4a635c]">
                <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                </Link>
                <span className="mx-1 text-[#0b1f1c]/20">•</span>
                <Link href="/" className="text-[#5a736c] transition-colors hover:text-[#0b1f1c]">
                    Back to Home
                </Link>
            </CardFooter>
        </Card>
    )
}
