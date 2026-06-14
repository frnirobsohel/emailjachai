"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { useRouter } from "next/navigation"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { registerSchema, RegisterValues } from "@/features/auth/schemas/register.schema"

export function RegisterForm() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    const form = useForm<RegisterValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            firstName: "",
            lastName: "",
            email: "",
            password: "",
        }
    })

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
                throw new Error(result.message || "Registration failed")
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Registration failed")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <label htmlFor="first-name" className="text-sm font-medium">First name</label>
                    <Input {...form.register("firstName")} id="first-name" name="firstName" placeholder="Max" autoComplete="given-name" />
                    {form.formState.errors.firstName && <span className="text-xs text-red-500">{form.formState.errors.firstName.message}</span>}
                </div>
                <div className="grid gap-2">
                    <label htmlFor="last-name" className="text-sm font-medium">Last name</label>
                    <Input {...form.register("lastName")} id="last-name" name="lastName" placeholder="Robinson" autoComplete="family-name" />
                    {form.formState.errors.lastName && <span className="text-xs text-red-500">{form.formState.errors.lastName.message}</span>}
                </div>
            </div>
            <div className="grid gap-2">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input {...form.register("email")} id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" />
                {form.formState.errors.email && <span className="text-xs text-red-500">{form.formState.errors.email.message}</span>}
            </div>
            <div className="grid gap-2">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <Input {...form.register("password")} id="password" name="password" type="password" autoComplete="new-password" />
                {form.formState.errors.password && <span className="text-xs text-red-500">{form.formState.errors.password.message}</span>}
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create an account"}
            </Button>
            <Button variant="outline" type="button" className="w-full">
                Sign up with GitHub
            </Button>
        </form>
    )
}
