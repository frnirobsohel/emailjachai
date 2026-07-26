"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { logger } from "@/lib/logger"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, LoginValues } from "@/features/auth/schemas/login.schema"
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type LoginUser = {
    id: number
    name: string
    email: string
    role: string
}

export function LoginForm() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [shake, setShake] = useState(false)

    useEffect(() => {
        if (searchParams.get("registered") === "true") {
            setSuccess("Account created successfully. Please login.")
        }
    }, [searchParams])

    const form = useForm<LoginValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    function triggerShake() {
        setShake(false)
        requestAnimationFrame(() => setShake(true))
    }

    async function onSubmit(values: LoginValues) {
        setIsLoading(true)
        setError("")
        setSuccess("")

        try {
            const res = await fetch("/next-api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })
            const result = await res.json()

            if (result.status === "success") {
                const user = result.data as LoginUser | undefined
                const role = user?.role || "user"
                router.refresh()
                router.push(role === "admin" ? "/admin" : "/dashboard")
            } else {
                setError(result.message || "Invalid credentials")
                triggerShake()
            }
        } catch (err: unknown) {
            logger.error("Login unexpected error:", err)
            setError("An unexpected error occurred during login")
            triggerShake()
        } finally {
            setIsLoading(false)
        }
    }

    function onInvalid() {
        triggerShake()
    }

    return (
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
            {success && (
                <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-md border border-emerald-700/20 bg-emerald-50 p-3 text-sm text-emerald-800"
                >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium leading-tight">{success}</span>
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
            <div className="flex min-h-[72px] flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium leading-none text-[#3d564f]">
                        Password
                    </label>
                    <Link
                        href="/forgot-password"
                        className="text-xs font-medium text-[#5a736c] transition-colors hover:text-[#0f5c52]"
                    >
                        Forgot your password?
                    </Link>
                </div>
                <div className="relative">
                    <Input
                        {...form.register("password")}
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        disabled={isLoading}
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
            <Button
                type="submit"
                disabled={isLoading}
                className="mt-1 w-full rounded-md border border-[#08352f] bg-[#0f5c52] font-semibold text-white shadow-none hover:bg-[#0b4a42]"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logging in...
                    </>
                ) : (
                    "Login"
                )}
            </Button>
        </form>
    )
}
