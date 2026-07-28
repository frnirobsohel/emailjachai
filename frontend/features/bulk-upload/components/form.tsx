"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    Upload,
    FileText,
    AlertCircle,
    X,
    Clock,
    FileCheck,
    Eye,
    Download,
    Loader2,
    CheckCircle2
} from "lucide-react"
import Link from "next/link"
import { useSettings } from "@/lib/settings-context"
import { useDashboardStore } from "@/stores/dashboard-store"
import { useCreditStore } from "@/stores/credit-state"

interface UploadStats {
    emailCount: number;
    duplicateCount: number;
    jobId: string;
    fileName: string;
    fileSize: number;
}

export function BulkUploadForm() {
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"
    const [isDragOver, setIsDragOver] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadStats, setUploadStats] = useState<UploadStats | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
    }, [])

    const handleFileSelect = useCallback((file?: File | null) => {
        setError(null)
        setUploadStats(null)

        if (!file) {
            return
        }

        const normalizedName = (file.name || '').toLowerCase()
        const mimeType = file.type || ''
        const allowedTypes = ['text/csv', 'text/plain', 'application/csv']
        if (!allowedTypes.includes(mimeType) && !normalizedName.endsWith('.csv') && !normalizedName.endsWith('.txt')) {
            setError('Please upload a CSV or TXT file only.')
            return
        }

        if (file.size > 200 * 1024 * 1024) {
            setError('File size must be less than 200MB.')
            return
        }

        setSelectedFile(file)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)

        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            handleFileSelect(files[0])
        }
    }, [handleFileSelect])

    const handleUpload = async () => {
        if (!selectedFile) return

        setIsUploading(true)
        setUploadProgress(0)
        setError(null)

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const clickTimestamp = Date.now();
            formData.append('idempotencyKey', `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}:${clickTimestamp}`);

            setUploadProgress(20);

            const response = await fetch('/next-api/proxy/jobs/submit-file', {
                method: 'POST',
                body: formData,
            });

            setUploadProgress(80);

            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                throw new Error(result.message || "Failed to submit job to API");
            }

            setUploadProgress(100);
            const data = result.data as {
                total?: number
                queued?: number
                duplicates_removed?: number
                jobId: string
                is_duplicate?: boolean
            }
            setUploadStats({
                emailCount: data.total ?? 0,
                duplicateCount: data.duplicates_removed ?? 0,
                jobId: data.jobId,
                fileName: selectedFile.name,
                fileSize: selectedFile.size
            });

            // Credits are deducted for queued emails on submit — refresh UI immediately
            // (same stale Redis stats cache issue as single verify). Skip debit on idempotent replay.
            if (!data.is_duplicate) {
                const charged = Math.max(0, data.queued ?? data.total ?? 0)
                const dash = useDashboardStore.getState()
                if (charged > 0 && dash.stats?.credits_remaining != null) {
                    const current = Number(String(dash.stats.credits_remaining).replace(/,/g, ""))
                    if (Number.isFinite(current)) {
                        dash.setStats({
                            ...dash.stats,
                            credits_remaining: Math.max(0, current - charged).toLocaleString(),
                        })
                    }
                    useCreditStore.getState().deductCredits(charged)
                }
                dash.upsertRecentJob({
                    job_id: data.jobId,
                    filename: selectedFile.name,
                    status: "pending",
                    total_emails: data.total ?? 0,
                    processed_count: 0,
                    created_at: new Date().toISOString(),
                    type: "bulk",
                })
                void dash.fetchStats(true)
            }

        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred during upload.");
        } finally {
            setIsUploading(false)
            setSelectedFile(null)
        }
    }

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Upload Section */}
            <Card className="overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <Upload className="h-5 w-5 text-[#0f5c52]" />
                        Upload Your File
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        Drag and drop or click to browse for your email list file
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div
                        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                            isMaintenance
                                ? 'border-amber-200 bg-amber-50/10 cursor-not-allowed opacity-80'
                                : isDragOver
                                    ? 'border-[#0f5c52] bg-[#0f5c52]/5 cursor-pointer'
                                    : 'border-[#0b1f1c]/15 hover:border-[#0f5c52]/50 hover:bg-[#f0f4f2]/40 cursor-pointer'
                            }`}
                        onDragOver={isMaintenance ? undefined : handleDragOver}
                        onDragLeave={isMaintenance ? undefined : handleDragLeave}
                        onDrop={isMaintenance ? undefined : handleDrop}
                        onClick={() => !isMaintenance && !selectedFile && !isUploading && fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                    handleFileSelect(file)
                                }
                            }}
                            className="hidden"
                            disabled={!!selectedFile || isUploading || isMaintenance}
                        />

                        {selectedFile ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-center">
                                    <div className="p-3 bg-[#0f5c52]/10 rounded-full">
                                        <FileText className="h-8 w-8 text-[#0f5c52]" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-medium text-[#0b1f1c]">{selectedFile.name}</p>
                                    <p className="text-sm text-[#5a736c]">
                                        {formatFileSize(selectedFile.size)}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-[#0b1f1c]/15 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedFile(null)
                                        if (fileInputRef.current) fileInputRef.current.value = ""
                                    }}
                                >
                                    <X className="h-4 w-4 mr-2" />
                                    Remove
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-center">
                                    <div className={`p-3 rounded-full ${isMaintenance ? 'bg-amber-100' : 'bg-[#0f5c52]/10 hover:bg-[#0f5c52]/15'} transition-colors`}>
                                        <Upload className={`h-8 w-8 ${isMaintenance ? 'text-amber-500' : 'text-[#0f5c52]'} transition-colors`} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-lg font-medium text-[#0b1f1c]">
                                        {isMaintenance ? "File Upload Disabled" : "Drag and drop or click to browse"}
                                    </p>
                                    <p className="text-sm text-[#5a736c]">
                                        {isMaintenance ? settings?.maintenance_message || "System is undergoing maintenance" : "CSV or TXT files up to 200MB"}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedFile && (
                        <div className="mt-4">
                            <Button
                                onClick={handleUpload}
                                disabled={isUploading || isMaintenance}
                                className="w-full rounded-md border border-[#08352f] bg-[#0f5c52] text-white shadow-none hover:bg-[#0b4a42]"
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Upload File
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

                    {error && (
                        <Alert variant="destructive" className="mt-4 bg-rose-50 border-rose-100 text-rose-900">
                            <AlertCircle className="h-4 w-4 text-rose-600" />
                            <AlertDescription className="text-rose-800">{error}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* Upload Information Panel */}
            <Card className="h-fit overflow-hidden border-[#0b1f1c]/10 bg-white/90 shadow-none">
                <CardHeader className="border-b border-[#0b1f1c]/8 bg-[#f0f4f2]/60">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <FileCheck className="h-5 w-5 text-[#0f5c52]" />
                        Processing Status
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        {uploadStats ? 'Upload completed successfully' : 'Real-time processing updates'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    {isUploading ? (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[#0b1f1c] font-medium">Upload Progress</span>
                                    <span className="text-[#0f5c52] font-bold">{Math.round(uploadProgress)}%</span>
                                </div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#e4ece9]">
                                    <div
                                        className="h-full bg-[#0f5c52] transition-all rounded-full"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            </div>
                            <div className="text-sm text-[#5a736c] animate-pulse flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Analyzing records and preparing for queue...
                            </div>
                        </div>
                    ) : uploadStats ? (
                        <div className="space-y-4">
                            {/* Success Banner */}
                            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-emerald-800">Upload Successful!</p>
                                    <p className="text-xs text-emerald-600">{uploadStats.fileName} is now queued for processing.</p>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center justify-between p-2 bg-[#f0f4f2]/60 rounded-md border border-[#0b1f1c]/8">
                                    <span className="text-sm font-medium text-[#3d564f]">Email Count:</span>
                                    <Badge variant="outline" className="bg-white border-[#0f5c52]/25 text-[#0f5c52] font-bold">
                                        {uploadStats.emailCount.toLocaleString()}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-[#f0f4f2]/60 rounded-md border border-[#0b1f1c]/8">
                                    <span className="text-sm font-medium text-[#3d564f]">Duplicates Removed:</span>
                                    <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 font-bold">
                                        {uploadStats.duplicateCount.toLocaleString()}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-[#f0f4f2]/60 rounded-md border border-[#0b1f1c]/8">
                                    <span className="text-sm font-medium text-[#3d564f]">Job ID:</span>
                                    <Badge variant="secondary" className="bg-[#f0f4f2] text-[#3d564f] font-mono text-[10px]">
                                        #{uploadStats.jobId.substring(0, 12)}...
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-[#f0f4f2]/60 rounded-md border border-[#0b1f1c]/8">
                                    <span className="text-sm font-medium text-[#3d564f]">File:</span>
                                    <span className="text-xs text-[#5a736c] truncate max-w-[150px] font-medium">
                                        {uploadStats.fileName}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" asChild className="flex-1 border-[#0f5c52]/25 text-[#0f5c52] hover:bg-[#0f5c52]/5">
                                    <Link href="/dashboard/jobs">
                                        <Eye className="mr-2 h-4 w-4" /> View Jobs
                                    </Link>
                                </Button>
                                <Button variant="outline" size="sm" asChild className="flex-1 border-[#0f5c52]/25 text-[#0f5c52] hover:bg-[#0f5c52]/5">
                                    <a href={`/next-api/proxy/jobs/download?jobId=${uploadStats.jobId}&format=csv`} target="_blank" rel="noopener noreferrer">
                                        <Download className="mr-2 h-4 w-4" /> Download
                                    </a>
                                </Button>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-[#5a736c] hover:text-[#0b1f1c] hover:bg-[#f0f4f2]/60 border border-dashed border-[#0b1f1c]/15"
                                onClick={() => setUploadStats(null)}
                            >
                                <Upload className="mr-2 h-3.5 w-3.5" /> Upload Another File
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="inline-flex items-center justify-center p-4 bg-[#f0f4f2]/60 rounded-full mb-4">
                                <Clock className="h-8 w-8 text-[#8aa099]" />
                            </div>
                            <p className="text-[#3d564f] font-medium">Ready to Process</p>
                            <p className="text-sm text-[#8aa099] mt-1 max-w-[200px] mx-auto">
                                Upload a file to see Processing details and Job ID
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
