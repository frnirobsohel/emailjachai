"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { Suspense } from "react"
import { LoginForm } from "@/features/auth/components/login-form"

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
