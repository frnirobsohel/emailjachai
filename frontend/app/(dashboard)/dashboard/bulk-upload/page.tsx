import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Bulk Email Verification",
}

import { BulkUploadForm } from "@/features/bulk-upload/components/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Database, CheckCircle, AlertTriangle } from "lucide-react"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"

export default function BulkUploadPage() {
    return (
        <div className="flex-1 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Bulk Email Verification</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">
                        Upload a CSV or TXT file — processing starts automatically after upload.
                    </p>
                </div>
                <CreditBadge />
            </div>

            <div>
                <BulkUploadForm />
            </div>

            {/* Requirements Section */}
            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <AlertTriangle className="h-5 w-5 text-[#0f5c52]" />
                        Upload Requirements
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        Please ensure your file meets these requirements for successful processing
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3 p-4 bg-amber-50/30 rounded-lg border border-amber-100/50">
                            <h4 className="font-semibold flex items-center gap-2 text-amber-900">
                                <Mail className="h-4 w-4 text-amber-600" />
                                File Format
                            </h4>
                            <ul className="space-y-2 text-sm text-amber-800/80">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    First column must contain email addresses
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    Supported extensions: .CSV, .TXT
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    UTF-8 encoding is highly recommended
                                </li>
                            </ul>
                        </div>

                        <div className="space-y-3 p-4 bg-amber-50/30 rounded-lg border border-amber-100/50">
                            <h4 className="font-semibold flex items-center gap-2 text-amber-900">
                                <Database className="h-4 w-4 text-amber-600" />
                                System Limits
                            </h4>
                            <ul className="space-y-2 text-sm text-amber-800/80">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    Maximum 100,000 emails per file
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    Maximum file size: 200MB
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                                    Verification starts as soon as upload finishes
                                </li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
