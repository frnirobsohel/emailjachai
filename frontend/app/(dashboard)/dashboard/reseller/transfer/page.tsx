"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Shield, Send, AlertCircle, CheckCircle2, Info } from "lucide-react"
import { Button } from "@/components/common/button"
import { Input } from "@/components/common/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/common/card"
import { ApiClient } from "@/lib/api-client"
import { Alert, AlertDescription, AlertTitle } from "@/components/common/alert"
import { CreditBadge } from "@/app/(dashboard)/_components/credit-badge"

export default function ResellerTransferPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [amount, setAmount] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        const role = localStorage.getItem('sidebar_role')
        if (role !== 'reseller' && role !== 'admin') {
            router.replace('/dashboard')
        } else {
            setIsAuthorized(true)
        }
    }, [router])

    const handleTransfer = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        if (!email) {
            setError("Recipient email is required.")
            setIsLoading(false)
            return
        }

        const credits = parseInt(amount)
        if (isNaN(credits) || credits <= 0) {
            setError("Please enter a valid credit amount greater than zero.")
            setIsLoading(false)
            return
        }

        try {
            const result = await ApiClient.post("/reseller/transfer", {
                email,
                amount: credits
            })

            if (result.status === "success") {
                setSuccess(result.message || "Credits transferred successfully.")
                setEmail("")
                setAmount("")
                // Emit event to update CreditBadge if needed
                window.dispatchEvent(new Event('creditsUpdated'))
            } else {
                setError(result.message || "Transfer failed. Please check the email and your balance.")
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred during transfer.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Reseller Portal</h2>
                <CreditBadge />
            </div>

            {isAuthorized === true ? (
                <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in duration-500">
                    {/* Transfer Form Section */}
                    <Card className="shadow-sm border-indigo-100 overflow-hidden h-fit">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Send className="h-5 w-5 text-indigo-500" />
                            Transfer Credits
                        </CardTitle>
                        <CardDescription>
                            Distribute credits to other users instantly.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Recipient Email</label>
                                <Input
                                    type="email"
                                    placeholder="user@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="border-indigo-100 focus-visible:ring-indigo-500 h-11"
                                    disabled={isLoading}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Credit Amount</label>
                                <Input
                                    type="number"
                                    placeholder="Ex: 5000"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="border-indigo-100 focus-visible:ring-indigo-500 h-11"
                                    disabled={isLoading}
                                    min="1"
                                    required
                                />
                            </div>

                            {error && (
                                <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-900">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription className="text-xs">{error}</AlertDescription>
                                </Alert>
                            )}

                            {success && (
                                <Alert className="border-green-200 bg-green-50 text-green-900">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <AlertTitle>Success</AlertTitle>
                                    <AlertDescription className="text-xs">{success}</AlertDescription>
                                </Alert>
                            )}

                            <Button 
                                type="submit" 
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 text-md font-semibold transition-all shadow-md active:scale-[0.98]"
                                disabled={isLoading}
                            >
                                {isLoading ? "Processing Request..." : "Confirm Transfer"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Guidelines Section */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Shield className="h-5 w-5 text-slate-500" />
                            Security & Guidelines
                        </CardTitle>
                        <CardDescription>
                            Important information for resellers.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="space-y-3">
                            <div className="flex gap-3 text-sm text-slate-600">
                                <div className="mt-0.5">
                                    <Info className="h-4 w-4 text-indigo-500" />
                                </div>
                                <p>Verify the recipient's email address carefully. Credit transfers are processed instantly and cannot be reversed.</p>
                            </div>
                            <div className="flex gap-3 text-sm text-slate-600">
                                <div className="mt-0.5">
                                    <Info className="h-4 w-4 text-indigo-500" />
                                </div>
                                <p>Transferred credits are deducted directly from your available balance displayed at the top right.</p>
                            </div>
                            <div className="flex gap-3 text-sm text-slate-600">
                                <div className="mt-0.5">
                                    <Info className="h-4 w-4 text-indigo-500" />
                                </div>
                                <p>Recipients can use these credits immediately for any verification tasks on the platform.</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 mt-2">
                            <h4 className="text-sm font-bold text-indigo-900 mb-1">Account Safety</h4>
                            <p className="text-xs text-indigo-800 leading-relaxed">
                                Avoid sharing your account credentials. All reseller activities are logged for security and auditing purposes. 
                                High-volume transfers may be flagged for manual review by system administrators.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
            ) : (
                <div className="h-[400px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                        <p className="text-sm font-medium animate-pulse">Verifying access...</p>
                    </div>
                </div>
            )}
        </div>
    )
}
