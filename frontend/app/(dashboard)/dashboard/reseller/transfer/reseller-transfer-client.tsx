"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Shield, Send, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
import { ResellerTransferForm } from "@/features/reseller/components/reseller-transfer-form"

export function ResellerTransferClient({ initialRole }: { initialRole: string }) {
    const router = useRouter()
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

    useEffect(() => {
        if (initialRole !== 'reseller' && initialRole !== 'admin') {
            router.replace('/dashboard')
        } else {
            setIsAuthorized(true)
        }
    }, [router, initialRole])

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
                            <ResellerTransferForm />
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
