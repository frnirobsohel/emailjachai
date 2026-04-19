"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ApiClient } from "@/lib/api-client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

const registerSchema = z.object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number"),
})

type RegisterValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
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
            const result = await ApiClient.post("/auth/register", values);

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
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Sign Up</CardTitle>
                <CardDescription>
                    Enter your information to create an account
                </CardDescription>
            </CardHeader>
            <CardContent>
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
                <div className="mt-4 text-center text-sm">
                    Already have an account?{" "}
                    <Link href="/login" className="underline">
                        Sign in
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
