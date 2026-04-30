"use client"

import Link from "next/link"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/common/card"
import { ArrowLeft } from "lucide-react"
import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"

type LoginUser = {
    id: number
    name: string
    email: string
    role: string
}

function LoginForm() {
    const searchParams = useSearchParams()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    useEffect(() => {
        if (searchParams.get("registered") === "true") {
            setSuccess("Account created successfully. Please login.")
        }
    }, [searchParams])

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsLoading(true)
        setError("")
        setSuccess("")

        const formData = new FormData(event.currentTarget)
        const email = formData.get("email")
        const password = formData.get("password")

        try {
            const result = await ApiClient.post("/auth/login", { email, password });

            if (result.status === 'success') {
                const user = result.data as LoginUser | undefined;
                const role = user?.role || 'user';

                if (role === 'admin') {
                    window.location.href = "/admin";
                } else {
                    window.location.href = "/dashboard";
                }
            } else {
                setError(result.message || "Invalid credentials");
            }
        } catch (err: unknown) {
            logger.error("Login unexpected error:", err);
            setError("An unexpected error occurred during login");
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
                <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
                <Input id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
                <div className="flex items-center">
                    <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
                    <Link href="/forgot-password" className="ml-auto inline-block text-sm underline">
                        Forgot your password?
                    </Link>
                </div>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
            {success && <div className="text-green-500 text-sm">{success}</div>}
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Logging in..." : "Login"}
            </Button>
            <Button variant="outline" type="button" className="w-full">
                Login with Google
            </Button>
        </form>
    )
}

export default function LoginPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl">Login</CardTitle>
                <CardDescription>
                    Enter your email below to login to your account
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Suspense fallback={<div>Loading form...</div>}>
                    <LoginForm />
                </Suspense>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <div className="mt-4 text-center text-sm flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span>Don&apos;t have an account?</span>
                    <Link href="/register" className="underline font-medium">
                        Sign up
                    </Link>
                    <span className="text-slate-300 mx-1">•</span>
                    <Link href="/" className="inline-flex items-center gap-1 hover:underline text-slate-500">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
                    </Link>
                </div>
            </CardFooter>
        </Card>
    )
}
