"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Mail, Loader2, ArrowRight } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"
import { useSettings } from "@/lib/settings-context"
import { useDashboardStore } from "@/stores/dashboard-store"

export interface VerificationResult {
    job_id: string
    email: string
    status: string
    score: number
    processingTime: number
    detailedChecks: {
        safeToSend: boolean
        deliverable: boolean
        invalidSyntax: boolean
        disposableEmail: boolean
        mxRecords: boolean
        smtpConnect: boolean
        userExist: boolean
        unknown: boolean
        mailboxFull: boolean
        catchAll: boolean
        roleAccount: boolean
        freeAccount: boolean
        spamTrap?: boolean
        blacklist?: boolean
    }
    rawJson: unknown
}

interface SingleVerifyFormProps {
    onVerify: (result: VerificationResult) => void
}

export function SingleVerifyForm({ onVerify }: SingleVerifyFormProps) {
    const [email, setEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || isMaintenance) return

        setIsLoading(true)
        setError(null)

        try {
            const result = await ApiClient.post(
                "/jobs/verify-single",
                { email },
                { timeout: 60000 }
            )

            if (result.status === "success") {
                onVerify(result.data as VerificationResult)
                void useDashboardStore.getState().fetchStats(true)
            } else {
                setError(result.message || "Failed to verify email")
            }
        } catch (err: unknown) {
            logger.error("Verification operation failed:", err)
            setError(err instanceof Error ? err.message : "An unexpected error occurred during verification")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="h-fit overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
            <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                    <Mail className="h-5 w-5 text-[#0f5c52]" />
                    Email Verification
                </CardTitle>
                <CardDescription className="text-[#5a736c]">
                    Enter an email address to verify its validity
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleVerify}>
                <CardContent className="space-y-4 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-[#3d564f]">
                            Email Address
                        </Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa099]" />
                            <Input
                                id="email"
                                type="email"
                                placeholder={
                                    isMaintenance
                                        ? "Verification is temporarily paused..."
                                        : "name@example.com"
                                }
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading || isMaintenance}
                                className="border-[#0b1f1c]/12 pl-10 focus-visible:ring-[#0f5c52]/30"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <p className="text-xs text-[#6b857c]">This action uses 1 credit.</p>
                    </div>
                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2 rounded-md border border-rose-700/20 bg-rose-50 p-3 text-sm text-rose-800"
                        >
                            <span className="font-medium">Error:</span>
                            {error}
                        </div>
                    )}
                    <Button
                        type="submit"
                        disabled={!email || isLoading || isMaintenance}
                        className="w-full rounded-md border border-[#08352f] bg-[#0f5c52] font-semibold text-white shadow-none hover:bg-[#0b4a42]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verifying...
                            </>
                        ) : isMaintenance ? (
                            "Verification Disabled"
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
