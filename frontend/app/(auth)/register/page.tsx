import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Sign Up",
}

import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { RegisterForm } from "@/features/auth/components/register-form"

export default function RegisterPage() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Sign Up</CardTitle>
                <CardDescription>
                    Enter your information to create an account
                </CardDescription>
            </CardHeader>
            <CardContent>
                <RegisterForm />
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <div className="mt-4 text-center text-sm flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span>Already have an account?</span>
                    <Link href="/login" className="underline font-medium">
                        Sign in
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
