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
import {
    resetPasswordWithCodeSchema,
    ResetPasswordWithCodeValues,
} from "@/features/auth/schemas/reset-password.schema"
import { cn } from "@/lib/utils"

const cardClass =
    "border-[#0b1f1c]/10 bg-white/90 shadow-[0_16px_48px_-24px_rgba(11,31,28,0.35)] backdrop-blur-sm"

function ResetPasswordForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const email = (searchParams.get("email") || "").trim().toLowerCase()

    const [isLoading, setIsLoading] = useState(false)
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(60)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [shake, setShake] = useState(false)

    useEffect(() => {
        if (!email) {
            setError("Missing email. Request a reset code first.")
        }
    }, [email])

    useEffect(() => {
        if (cooldown <= 0) return
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
        return () => clearTimeout(t)
    }, [cooldown])

    const form = useForm<ResetPasswordWithCodeValues>({
        resolver: zodResolver(resetPasswordWithCodeSchema),
        defaultValues: {
            code: "",
            password: "",
            confirmPassword: "",
        },
    })

    function triggerShake() {
        setShake(false)
        requestAnimationFrame(() => setShake(true))
    }

    async function onSubmit(values: ResetPasswordWithCodeValues) {
        setError(null)

        if (!email) {
            setError("Missing email. Request a reset code first.")
            triggerShake()
            return
        }

        setIsLoading(true)

        try {
            const res = await ApiClient.post("/auth/reset-password", {
                email,
                code: values.code,
                password: values.password,
            })
            if (res.status === "success") {
                setSubmitted(true)
            } else {
                setError(res.message || "Failed to reset password")
                triggerShake()
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred")
            triggerShake()
        } finally {
            setIsLoading(false)
        }
    }

    async function onResend() {
        if (!email || cooldown > 0 || resending) return
        setError(null)
        setResending(true)
        try {
            const res = await ApiClient.post("/auth/resend-reset", { email })
            if (res.status === "success") {
                setCooldown(60)
            } else {
                setError(res.message || "Could not resend code")
                if (String(res.message || "").toLowerCase().includes("wait")) {
                    setCooldown(60)
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Could not resend code")
        } finally {
            setResending(false)
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
                        Password Reset
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        Your password has been successfully reset. You can now login with your new credentials.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        className="w-full rounded-md border border-[#08352f] bg-[#0f5c52] font-semibold text-white shadow-none hover:bg-[#0b4a42]"
                        onClick={() => router.push("/login")}
                    >
                        Go to Login
                    </Button>
                </CardContent>
                <CardFooter className="flex justify-center text-sm">
                    <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
                    </Link>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className={cardClass}>
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-2xl tracking-tight text-[#0b1f1c]">Reset Password</CardTitle>
                <CardDescription className="text-[#5a736c]">
                    {email
                        ? <>Enter the code sent to <span className="font-medium text-[#0b1f1c]">{email}</span> and your new password.</>
                        : "Enter the code from your email and your new password."}
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
                        <label htmlFor="code" className="text-sm font-medium leading-none text-[#3d564f]">
                            Reset code
                        </label>
                        <Input
                            {...form.register("code")}
                            id="code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            disabled={isLoading || !email}
                            className={cn(
                                "border-[#0b1f1c]/12 tracking-[0.3em] focus-visible:ring-[#0f5c52]/30",
                                form.formState.errors.code && "border-rose-500 focus-visible:ring-rose-500"
                            )}
                        />
                        {form.formState.errors.code ? (
                            <span className="text-xs font-medium text-rose-600">
                                {form.formState.errors.code.message}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex min-h-[72px] flex-col gap-1.5">
                        <label htmlFor="password" className="text-sm font-medium leading-none text-[#3d564f]">
                            New Password
                        </label>
                        <div className="relative">
                            <Input
                                {...form.register("password")}
                                id="password"
                                type={showPassword ? "text" : "password"}
                                disabled={isLoading || !email}
                                className={cn(
                                    "border-[#0b1f1c]/12 pr-10 focus-visible:ring-[#0f5c52]/30",
                                    form.formState.errors.password && "border-rose-500 focus-visible:ring-rose-500"
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8aa099] transition-colors hover:text-[#0b1f1c] focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {form.formState.errors.password ? (
                            <span className="text-xs font-medium text-rose-600">
                                {form.formState.errors.password.message}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex min-h-[72px] flex-col gap-1.5">
                        <label htmlFor="confirmPassword" className="text-sm font-medium leading-none text-[#3d564f]">
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <Input
                                {...form.register("confirmPassword")}
                                id="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                disabled={isLoading || !email}
                                className={cn(
                                    "border-[#0b1f1c]/12 pr-10 focus-visible:ring-[#0f5c52]/30",
                                    form.formState.errors.confirmPassword && "border-rose-500 focus-visible:ring-rose-500"
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8aa099] transition-colors hover:text-[#0b1f1c] focus:outline-none"
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {form.formState.errors.confirmPassword ? (
                            <span className="text-xs font-medium text-rose-600">
                                {form.formState.errors.confirmPassword.message}
                            </span>
                        ) : null}
                    </div>
                    <Button
                        type="submit"
                        disabled={isLoading || !email}
                        className="mt-1 w-full rounded-md border border-[#08352f] bg-[#0f5c52] font-semibold text-white shadow-none hover:bg-[#0b4a42]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...
                            </>
                        ) : (
                            "Reset Password"
                        )}
                    </Button>
                    {email ? (
                        <p className="text-center text-sm text-[#5a736c]">
                            Didn&apos;t get a code?{" "}
                            <button
                                type="button"
                                onClick={onResend}
                                disabled={cooldown > 0 || resending}
                                className="font-semibold text-[#0f5c52] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {resending
                                    ? "Sending..."
                                    : cooldown > 0
                                      ? `Resend in ${cooldown}s`
                                      : "Resend code"}
                            </button>
                        </p>
                    ) : (
                        <p className="text-center text-sm">
                            <Link href="/forgot-password" className="font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                                Request a reset code
                            </Link>
                        </p>
                    )}
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

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <div className="grid animate-pulse gap-4 rounded-lg border border-[#0b1f1c]/10 bg-white/90 p-6" aria-hidden>
                    <div className="h-8 w-40 rounded bg-[#0b1f1c]/5" />
                    <div className="h-[72px] rounded-md bg-[#0b1f1c]/5" />
                    <div className="h-[72px] rounded-md bg-[#0b1f1c]/5" />
                    <div className="h-10 rounded-md bg-[#0b1f1c]/8" />
                </div>
            }
        >
            <ResetPasswordForm />
        </Suspense>
    )
}
