"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Mail, Loader2, ArrowRight } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"

export interface VerificationResult {
    job_id: string;
    email: string;
    status: string;
    score: number;
    processingTime: number;
    detailedChecks: {
        safeToSend: boolean;
        deliverable: boolean;
        invalidSyntax: boolean;
        disposableEmail: boolean;
        mxRecords: boolean;
        smtpConnect: boolean;
        userExist: boolean;
        unknown: boolean;
        mailboxFull: boolean;
        catchAll: boolean;
        roleAccount: boolean;
        freeAccount: boolean;
        spamTrap?: boolean;
        blacklist?: boolean;
    };
    rawJson: unknown;
}

interface SingleVerifyFormProps {
    onVerify: (result: VerificationResult) => void;
}

export function SingleVerifyForm({ onVerify }: SingleVerifyFormProps) {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) return

        setIsLoading(true)
        setError(null)

        try {
            // Use ApiClient to call the proxied backend
            const result = await ApiClient.post('/jobs/verify-single', {
                email: email
            });

            if (result.status === 'success') {
                onVerify(result.data as VerificationResult);
            } else {
                setError(result.message || "Failed to verify email");
            }
        } catch (err: unknown) {
            logger.error("Verification operation failed:", err);
            setError("An unexpected error occurred during verification");
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="shadow-sm border-indigo-100 overflow-hidden h-fit">
            <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Mail className="h-5 w-5 text-slate-500" />
                    Email Verification
                </CardTitle>
                <CardDescription>
                    Enter an email address to verify its validity
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleVerify}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                className="pl-10 focus-visible:ring-indigo-500"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This action uses 1 credit.
                        </p>
                    </div>
                    {error && (
                        <div className="p-3 text-sm rounded-md bg-red-50 text-red-900 border border-red-100 flex items-start gap-2">
                            <span className="text-red-600 font-medium">Error:</span>
                            {error}
                        </div>
                    )}
                    <Button
                        type="submit"
                        disabled={!email || isLoading}
                        className="w-full bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-sm"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : (
                            <>
                                Verify Email
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>
                </CardContent>
            </form>
        </Card>
    )
}
