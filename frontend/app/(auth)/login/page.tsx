import { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = {
    title: "Login",
    description: "Sign in to your EmailJachai Pro account",
}

function FormSkeleton() {
    return (
        <div className="grid animate-pulse gap-4" aria-hidden>
            <div className="h-[72px] rounded-md bg-[#0b1f1c]/5" />
            <div className="h-[72px] rounded-md bg-[#0b1f1c]/5" />
            <div className="mt-1 h-10 rounded-md bg-[#0b1f1c]/8" />
        </div>
    )
}

export default function LoginPage() {
    return (
        <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-[0_16px_48px_-24px_rgba(11,31,28,0.35)] backdrop-blur-sm">
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-2xl tracking-tight text-[#0b1f1c]">Login</CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Enter your email below to login to your account
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Suspense fallback={<FormSkeleton />}>
                    <LoginForm />
                </Suspense>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[#4a635c]">
                    <span>Don&apos;t have an account?</span>
                    <Link href="/register" className="font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                        Sign up
                    </Link>
                    <span className="mx-1 text-[#0b1f1c]/20">•</span>
                    <Link href="/" className="inline-flex items-center gap-1 text-[#5a736c] transition-colors hover:text-[#0b1f1c]">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
                    </Link>
                </div>
            </CardFooter>
        </Card>
    )
}
