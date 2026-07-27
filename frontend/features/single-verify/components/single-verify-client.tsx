"use client"

import { useState, useEffect } from "react"
import { SingleVerifyForm, VerificationResult } from "./form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Shield, Zap, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Copy, Download, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreditBadge } from "@/features/dashboard/components/credit-badge"
import { logger } from "@/lib/logger"
import { cn } from "@/lib/utils"

const NEGATIVE_CHECKS = new Set([
    "invalidSyntax",
    "disposableEmail",
    "mailboxFull",
    "catchAll",
    "spamTrap",
    "blacklist",
    "unknown",
])

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
    blacklist: false,
}

export function SingleVerifyClient() {
    const [result, setResult] = useState<VerificationResult | null>(null)
    const [isJsonOpen, setIsJsonOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!result || (result.status !== "pending" && result.status !== "processing")) return

        const handleJobUpdate = (event: Event) => {
            const { detail } = event as CustomEvent<{ job_id: string; data: VerificationResult }>
            if (detail.job_id === result.job_id) {
                logger.info("Real-time job update received via WS:", detail.data)
                setResult(detail.data)
            }
        }

        window.addEventListener("ws:job_update", handleJobUpdate as EventListener)

        const fallbackTimer = setTimeout(() => {
            logger.warn("WebSocket update timed out. Treating job as unknown.")
            setResult((prev) => (prev ? { ...prev, status: "unknown" } : null))
        }, 45000)

        return () => {
            window.removeEventListener("ws:job_update", handleJobUpdate as EventListener)
            clearTimeout(fallbackTimer)
        }
    }, [result])

    const displayResult = result || {
        status: "NA",
        score: 0,
        processingTime: 0.0,
        detailedChecks: defaultDetailedChecks,
        email: "no email verified",
    }

    const status = (displayResult.status || "").toLowerCase()
    const isFinished = !!result && !["pending", "processing", "na"].includes(status)

    const getStatusIcon = (value: string) => {
        const normalized = (value || "").toLowerCase()
        switch (normalized) {
            case "valid":
            case "deliverable":
                return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            case "invalid":
            case "undeliverable":
                return <XCircle className="h-4 w-4 text-rose-600" />
            case "unknown":
            case "risky":
            case "catch_all":
            case "catch-all":
            case "disposable":
                return <AlertCircle className="h-4 w-4 text-amber-600" />
            case "pending":
            case "processing":
                return <AlertCircle className="h-4 w-4 animate-pulse text-[#0f5c52]" />
            default:
                return <AlertCircle className="h-4 w-4 text-[#c5d4cf]" />
        }
    }

    const handleCopy = async () => {
        if (!result) return
        await navigator.clipboard.writeText(JSON.stringify(result.rawJson || result, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    const handleDownload = () => {
        if (!result) return
        const dataStr = JSON.stringify(result.rawJson || result, null, 2)
        const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)
        const linkElement = document.createElement("a")
        linkElement.setAttribute("href", dataUri)
        linkElement.setAttribute("download", `verification-${result.email || result.job_id}.json`)
        linkElement.click()
    }

    return (
        <div className="flex-1 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">
                        Single Email Verification
                    </h2>
                    <p className="mt-1 text-sm text-[#5a736c]">
                        Check deliverability, risk signals, and SMTP status in one pass.
                    </p>
                </div>
                <CreditBadge />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <SingleVerifyForm onVerify={setResult} />

                <Card className="h-fit overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                    <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                                    <Shield className="h-5 w-5 text-[#0f5c52]" />
                                    Verification Results
                                </CardTitle>
                                <CardDescription className="text-[#5a736c]">
                                    {result
                                        ? isFinished
                                            ? "Verification completed"
                                            : "Verification in progress..."
                                        : "Ready to verify"}
                                </CardDescription>
                            </div>
                            {result && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 border-[#0b1f1c]/15 text-[#0b1f1c] hover:border-[#0f5c52] hover:text-[#0f5c52]"
                                    onClick={() => setResult(null)}
                                >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                    Reset
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[#3d564f]">Status</span>
                            <div className="flex items-center gap-2">
                                {getStatusIcon(displayResult.status)}
                                <Badge
                                    className={cn(
                                        "border px-2.5 py-0.5 font-bold capitalize shadow-none",
                                        status === "valid" || status === "deliverable"
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                            : status === "invalid" || status === "undeliverable"
                                              ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50"
                                              : !result
                                                ? "border-[#0b1f1c]/10 bg-[#f0f4f2] text-[#8aa099] hover:bg-[#f0f4f2]"
                                                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
                                    )}
                                >
                                    {result ? displayResult.status : "Awaiting Verification"}
                                </Badge>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-[#3d564f]">
                                    Deliverability Score
                                </span>
                                <span
                                    className={cn(
                                        "text-lg font-semibold",
                                        !result
                                            ? "text-[#8aa099]"
                                            : displayResult.score >= 80
                                              ? "text-emerald-600"
                                              : displayResult.score >= 50
                                                ? "text-amber-600"
                                                : "text-rose-600"
                                    )}
                                >
                                    {result ? `${displayResult.score}/100` : "--/100"}
                                </span>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#e4ece9]">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all",
                                        !result
                                            ? "bg-[#c5d4cf]"
                                            : displayResult.score >= 80
                                              ? "bg-emerald-500"
                                              : displayResult.score >= 50
                                                ? "bg-amber-500"
                                                : "bg-rose-500"
                                    )}
                                    style={{ width: `${displayResult.score}%` }}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-[#0b1f1c]/8 pt-2">
                            <span className="text-sm text-[#5a736c]">Processing time</span>
                            <span className="text-sm font-medium text-[#0b1f1c]">
                                {result ? `${displayResult.processingTime}s` : "--"}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <Zap className="h-5 w-5 text-[#0f5c52]" />
                        Detailed Checks
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        Technical markers {result ? `for ${result.email}` : "(awaiting verification)"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                        {Object.entries(displayResult.detailedChecks || defaultDetailedChecks).map(
                            ([key, value]) => {
                                const isNegative = NEGATIVE_CHECKS.has(key)
                                const active = Boolean(value) && isFinished
                                return (
                                    <div
                                        key={key}
                                        className={cn(
                                            "flex items-center justify-between rounded-md border p-3 transition-colors",
                                            active && isNegative
                                                ? "border-amber-200 bg-amber-50/60"
                                                : active
                                                  ? "border-emerald-200 bg-emerald-50/50"
                                                  : "border-[#0b1f1c]/8 hover:bg-[#f0f4f2]/50"
                                        )}
                                    >
                                        <span className="text-xs font-medium capitalize text-[#4a635c]">
                                            {key.replace(/([A-Z])/g, " $1").trim()}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {active ? (
                                                isNegative ? (
                                                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                                ) : (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                )
                                            ) : (
                                                <XCircle className="h-3.5 w-3.5 text-[#c5d4cf]" />
                                            )}
                                            <span
                                                className={cn(
                                                    "text-[10px] font-bold uppercase",
                                                    active
                                                        ? isNegative
                                                            ? "text-amber-700"
                                                            : "text-emerald-700"
                                                        : "text-[#8aa099]"
                                                )}
                                            >
                                                {active ? "YES" : "NO"}
                                            </span>
                                        </div>
                                    </div>
                                )
                            }
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <button
                    type="button"
                    className="flex w-full items-center justify-between border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60 p-4 text-left transition-colors hover:bg-[#e8efec]"
                    onClick={() => setIsJsonOpen(!isJsonOpen)}
                >
                    <CardTitle className="text-lg font-semibold text-[#0b1f1c]">
                        Raw JSON Response
                    </CardTitle>
                    {isJsonOpen ? (
                        <ChevronUp className="h-5 w-5 text-[#5a736c]" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-[#5a736c]" />
                    )}
                </button>
                {isJsonOpen && (
                    <CardContent className="border-t border-[#0b1f1c]/20 bg-[#0b1f1c] pt-6">
                        <div className="mb-4 flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="border border-white/10 bg-white/10 text-[#e8f2ef] hover:bg-white/15"
                                disabled={!result}
                                onClick={handleCopy}
                            >
                                <Copy className="mr-2 h-3.5 w-3.5" />
                                {copied ? "Copied" : "Copy"}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="border border-white/10 bg-white/10 text-[#e8f2ef] hover:bg-white/15"
                                disabled={!result}
                                onClick={handleDownload}
                            >
                                <Download className="mr-2 h-3.5 w-3.5" /> Download
                            </Button>
                        </div>
                        <pre className="custom-scrollbar max-h-[400px] overflow-auto text-xs text-[#7dd3c7]">
                            {result
                                ? JSON.stringify(result.rawJson || result, null, 2)
                                : "// Awaiting verification result..."}
                        </pre>
                    </CardContent>
                )}
            </Card>
        </div>
    )
}
