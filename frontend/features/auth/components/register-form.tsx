"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { registerSchema, RegisterValues } from "@/features/auth/schemas/register.schema"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function RegisterForm() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [shake, setShake] = useState(false)

    const form = useForm<RegisterValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            password: "",
        },
    })

    function triggerShake() {
        setShake(false)
        requestAnimationFrame(() => setShake(true))
    }

    async function onSubmit(values: RegisterValues) {
        setIsLoading(true)
        setError("")

        try {
            const res = await fetch("/next-api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            })
            const result = await res.json()

            if (result.status === "success") {
                const email = encodeURIComponent(result.data?.email || values.email)
                if (result.data?.requiresVerification) {
                    router.push(`/verify-email?email=${email}`)
                } else {
                    router.push("/login?registered=true")
                }
            } else {
                setError(result.message || "Registration failed")
                triggerShake()
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Registration failed")
            triggerShake()
        } finally {
            setIsLoading(false)
        }
    }

    function onInvalid() {
        triggerShake()
    }

    const inputClass = "border-[#0b1f1c]/12 focus-visible:ring-[#0f5c52]/30"

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
            <div className="grid grid-cols-2 gap-4">
                <div className="flex min-h-[72px] flex-col gap-1.5">
                    <label htmlFor="first-name" className="text-sm font-medium leading-none text-[#3d564f]">
                        First name
                    </label>
                    <Input
                        {...form.register("firstName")}
                        id="first-name"
                        placeholder="Max"
                        autoComplete="given-name"
                        disabled={isLoading}
                        className={cn(inputClass, form.formState.errors.firstName && "border-rose-500 focus-visible:ring-rose-500")}
                    />
                    {form.formState.errors.firstName ? (
                        <span className="text-xs font-medium text-rose-600">
                            {form.formState.errors.firstName.message}
                        </span>
                    ) : null}
                </div>
                <div className="flex min-h-[72px] flex-col gap-1.5">
                    <label htmlFor="last-name" className="text-sm font-medium leading-none text-[#3d564f]">
                        Last name
                    </label>
                    <Input
                        {...form.register("lastName")}
                        id="last-name"
                        placeholder="Robinson"
                        autoComplete="family-name"
                        disabled={isLoading}
                        className={cn(inputClass, form.formState.errors.lastName && "border-rose-500 focus-visible:ring-rose-500")}
                    />
                    {form.formState.errors.lastName ? (
                        <span className="text-xs font-medium text-rose-600">
                            {form.formState.errors.lastName.message}
                        </span>
                    ) : null}
                </div>
            </div>
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
                    className={cn(inputClass, form.formState.errors.email && "border-rose-500 focus-visible:ring-rose-500")}
                />
                {form.formState.errors.email ? (
                    <span className="text-xs font-medium text-rose-600">
                        {form.formState.errors.email.message}
                    </span>
                ) : null}
            </div>
            <div className="flex min-h-[72px] flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium leading-none text-[#3d564f]">
                    Password
                </label>
                <div className="relative">
                    <Input
                        {...form.register("password")}
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        disabled={isLoading}
                        className={cn(
                            inputClass,
                            "pr-10",
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                    </>
                ) : (
                    "Create an account"
                )}
            </Button>
        </form>
    )
}
