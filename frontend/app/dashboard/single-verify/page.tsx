"use client"

import { useState, useEffect, useRef } from "react"
import { SingleVerifyForm, VerificationResult } from "@/components/dashboard/single-verify/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Shield, Zap, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Copy, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreditBadge } from "@/components/dashboard/credit-badge"
import { ApiClient } from "@/lib/api-client"
import { logger } from "@/lib/logger"

export default function SingleVerifyPage() {
    const [result, setResult] = useState<VerificationResult | null>(null)
    const [isJsonOpen, setIsJsonOpen] = useState(false)
    const pollingRef = useRef<NodeJS.Timeout | null>(null)

    // Poll for status if job is pending/processing
    useEffect(() => {
        if (result && (result.status === 'pending' || result.status === 'processing')) {
            if (pollingRef.current) return;

            const poll = async () => {
                try {
                    const response = await ApiClient.get<VerificationResult>(`/jobs/status?jobId=${result.job_id}`);
                    if (response.status === 'success' && response.data) {
                        setResult(response.data);
                        if (response.data.status === 'completed' || response.data.status === 'failed') {
                            if (pollingRef.current) clearInterval(pollingRef.current);
                            pollingRef.current = null;
                        }
                    }
                } catch (err) {
                    logger.error("Polling error:", err);
                }
            };

            pollingRef.current = setInterval(poll, 2000);
            poll(); // Immediate first check
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [result]);

    const defaultDetailedChecks = {
        safeToSend: false,
        deliverable: false,
        invalidSyntax: false,
        disposableEmail: false,
        mxRecords: false,
        smtpConnect: false,
        userExist: false,
        unknown: false,
        mailboxFull: false,
        catchAll: false,
        roleAccount: false,
        freeAccount: false,
        spamTrap: false,
        blacklist: false
    };

    const displayResult = result || {
        status: 'NA',
        score: 0,
        processingTime: 0.00,
        detailedChecks: defaultDetailedChecks,
        email: 'no email verified'
    };

    const getStatusIcon = (status: string) => {
        const normalized = (status || '').toLowerCase();
        switch (normalized) {
            case 'valid':
            case 'deliverable':
                return <CheckCircle2 className="h-4 w-4 text-green-600" />;
            case 'invalid':
            case 'undeliverable':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'unknown':
            case 'risky':
                return <AlertCircle className="h-4 w-4 text-orange-600" />;
            case 'catch_all':
            case 'catch-all':
                return <AlertCircle className="h-4 w-4 text-amber-600" />;
            case 'disposable':
                return <AlertCircle className="h-4 w-4 text-orange-600" />;
            case 'pending':
            case 'processing':
                return <AlertCircle className="h-4 w-4 text-blue-500 animate-pulse" />;
            default: return <AlertCircle className="h-4 w-4 text-slate-300" />;
        }
    };

    const getStatusBadgeClass = (status: string) => {
        const normalized = (status || '').toLowerCase();
        if (normalized === 'valid' || normalized === 'deliverable') return 'default';
        if (normalized === 'invalid' || normalized === 'undeliverable') return 'destructive';
        if (normalized === 'pending' || normalized === 'processing') return 'secondary';
        return 'secondary';
    };

    return (
        <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Single Email Verification</h2>
                <CreditBadge />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Form Section */}
                <SingleVerifyForm onVerify={setResult} />

                {/* Results Section */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden h-fit">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Shield className="h-5 w-5 text-slate-500" />
                            Verification Results
                        </CardTitle>
                        <CardDescription>
                            {result ? (['completed', 'valid', 'invalid', 'unknown', 'catch_all', 'disposable'].includes(result.status.toLowerCase()) ? 'Verification completed' : 'Verification in progress...') : 'Ready to verify'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status:</span>
                            <div className="flex items-center gap-2">
                                {getStatusIcon(displayResult.status)}
                                <Badge variant={getStatusBadgeClass(displayResult.status) as "default" | "destructive" | "secondary"} className="capitalize">
                                    {displayResult.status}
                                </Badge>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Deliverability Score:</span>
                                <span className="text-lg font-bold">{displayResult.score}/100</span>
                            </div>
                            <Progress value={displayResult.score} className="h-2 bg-slate-100" />
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <span className="text-sm text-slate-500">Processing time:</span>
                            <span className="text-sm font-medium">{displayResult.processingTime}s</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Checks Grid - Always visible */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <Zap className="h-5 w-5 text-slate-500" />
                        Detailed Checks
                    </CardTitle>
                    <CardDescription>
                        Technical markers {result ? `for ${result.email}` : '(awaiting verification)'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                        {Object.entries(displayResult.detailedChecks || defaultDetailedChecks).map(([key, value]) => {
                            const isFinished = result && ['completed', 'valid', 'invalid', 'unknown', 'catch_all', 'disposable'].includes(result.status.toLowerCase());
                            return (
                                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                                    <span className="text-xs font-medium capitalize text-slate-600">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {(value && isFinished) ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-slate-300" />}
                                        <span className={`text-[10px] font-bold uppercase ${(value && isFinished) ? 'text-green-600' : 'text-slate-400'}`}>
                                            {(value && isFinished) ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Raw JSON viewer - Always visible */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/50 bg-slate-50/50 border-b border-indigo-50/50 transition-colors"
                    onClick={() => setIsJsonOpen(!isJsonOpen)}
                >
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold text-slate-900">Raw JSON Response</CardTitle>
                    </div>
                    {isJsonOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                </div>
                {isJsonOpen && (
                    <CardContent className="bg-slate-900 border-t border-slate-800">
                        <div className="flex gap-2 mb-4">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                                disabled={!result}
                                onClick={() => result && navigator.clipboard.writeText(JSON.stringify(result.rawJson || result, null, 2))}
                            >
                                <Copy className="mr-2 h-3.3 w-3.5" /> Copy
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                                disabled={!result}
                                onClick={() => {
                                    if (!result) return;
                                    const dataStr = JSON.stringify(result.rawJson || result, null, 2);
                                    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                                    const linkElement = document.createElement('a');
                                    linkElement.setAttribute('href', dataUri);
                                    linkElement.setAttribute('download', `verification-${result.email || result.job_id}.json`);
                                    linkElement.click();
                                }}
                            >
                                <Download className="mr-2 h-3.3 w-3.5" /> Download
                            </Button>
                        </div>
                        <pre className="text-xs text-indigo-300 overflow-auto max-h-[400px]">
                            {result ? JSON.stringify(result.rawJson || result, null, 2) : "// Awaiting verification result..."}
                        </pre>
                    </CardContent>
                )}
            </Card>
        </div>
    )
}
