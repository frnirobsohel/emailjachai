import { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { RegisterForm } from "@/features/auth/components/register-form"

export const metadata: Metadata = {
    title: "Sign Up",
    description: "Create your EmailJachai Pro account",
}

export default function RegisterPage() {
    return (
        <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-[0_16px_48px_-24px_rgba(11,31,28,0.35)] backdrop-blur-sm">
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-2xl tracking-tight text-[#0b1f1c]">Sign Up</CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Enter your information to create an account
                </CardDescription>
            </CardHeader>
            <CardContent>
                <RegisterForm />
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[#4a635c]">
                    <span>Already have an account?</span>
                    <Link href="/login" className="font-semibold text-[#0f5c52] underline-offset-2 hover:underline">
                        Sign in
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
