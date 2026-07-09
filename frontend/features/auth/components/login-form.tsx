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
    const [shakeKey, setShakeKey] = useState(0)

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
        }
    })

    function triggerShake() {
        setShakeKey(prev => prev + 1)
    }

    async function onSubmit(values: LoginValues) {
        setIsLoading(true)
        setError("")
        setSuccess("")

        try {
            const res = await fetch("/next-api/auth/login", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const result = await res.json();

            if (result.status === 'success') {
                const user = result.data as LoginUser | undefined;
                const role = user?.role || 'user';

                if (role === 'admin') {
                    router.push("/admin");
                } else {
                    router.push("/dashboard");
                }
            } else {
                setError(result.message || "Invalid credentials");
                triggerShake();
            }
        } catch (err: unknown) {
            logger.error("Login unexpected error:", err);
            setError("An unexpected error occurred during login");
            triggerShake();
        } finally {
            setIsLoading(false)
        }
    }

    function onInvalid() {
        triggerShake()
    }

    return (
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
            {success && (
                <div className="rounded-lg border border-green-500/30 bg-green-50/90 p-3 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-950/50 dark:text-green-300 flex items-start gap-2.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    <span className="font-medium leading-tight">{success}</span>
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
            <div className="flex flex-col gap-1.5 min-h-[72px]">
                <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium leading-none">Password</label>
                    <Link href="/forgot-password" className="text-xs font-medium underline text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
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
            <Button type="submit" className="w-full mt-1 font-medium shadow-sm" disabled={isLoading}>
                {isLoading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Logging in...
                    </>
                ) : (
                    "Login"
                )}
            </Button>
        </form>
    )
}
