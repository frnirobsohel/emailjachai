"use client"

import Link from "next/link"
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
    const [shakeKey, setShakeKey] = useState(0)

    const form = useForm<RegisterValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            password: "",
        }
    })

    function triggerShake() {
        setShakeKey(prev => prev + 1)
    }

    async function onSubmit(values: RegisterValues) {
        setIsLoading(true)
        setError("")

        try {
            const res = await fetch("/next-api/auth/register", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const result = await res.json();

            if (result.status === 'success') {
                router.push("/login?registered=true")
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
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 min-h-[72px]">
                    <label htmlFor="first-name" className="text-sm font-medium leading-none">First name</label>
                    <Input 
                        {...form.register("firstName")} 
                        id="first-name" 
                        placeholder="Max" 
                        autoComplete="given-name" 
                        disabled={isLoading}
                        className={cn(form.formState.errors.firstName && "border-red-500 focus-visible:ring-red-500")}
                    />
                    {form.formState.errors.firstName ? (
                        <span className="text-xs font-medium text-red-500 flex items-center gap-1 animate-in fade-in duration-150">
                            {form.formState.errors.firstName.message}
                        </span>
                    ) : null}
                </div>
                <div className="flex flex-col gap-1.5 min-h-[72px]">
                    <label htmlFor="last-name" className="text-sm font-medium leading-none">Last name</label>
                    <Input 
                        {...form.register("lastName")} 
                        id="last-name" 
                        placeholder="Robinson" 
                        autoComplete="family-name" 
                        disabled={isLoading}
                        className={cn(form.formState.errors.lastName && "border-red-500 focus-visible:ring-red-500")}
                    />
                    {form.formState.errors.lastName ? (
                        <span className="text-xs font-medium text-red-500 flex items-center gap-1 animate-in fade-in duration-150">
                            {form.formState.errors.lastName.message}
                        </span>
                    ) : null}
                </div>
            </div>
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
                <label htmlFor="password" className="text-sm font-medium leading-none">Password</label>
                <div className="relative">
                    <Input 
                        {...form.register("password")} 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        autoComplete="new-password" 
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
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating account...
                    </>
                ) : (
                    "Create an account"
                )}
            </Button>
        </form>
    )
}
