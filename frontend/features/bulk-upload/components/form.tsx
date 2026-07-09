"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
    Upload,
    FileText,
    AlertCircle,
    X,
    Clock,
    FileCheck,
    Eye,
    Download
} from "lucide-react"
import Link from "next/link"
import { useSettings } from "@/lib/settings-context"

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
            const data = result.data as any;
            setUploadStats({
                emailCount: data.total ?? 0,
                duplicateCount: data.duplicates_removed ?? 0,
                jobId: data.jobId,
                fileName: selectedFile.name,
                fileSize: selectedFile.size
            });

        } catch (err: any) {
            setError(err.message || "An unexpected error occurred during upload.");
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
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <Upload className="h-5 w-5 text-slate-500" />
                        Upload Your File
                    </CardTitle>
                    <CardDescription>
                        Drag and drop or click to browse for your email list file
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                            isMaintenance
                                ? 'border-amber-200 bg-amber-50/10 cursor-not-allowed opacity-80'
                                : isDragOver
                                    ? 'border-indigo-500 bg-indigo-50/50 cursor-pointer'
                                    : 'border-indigo-200 hover:border-indigo-500/50 hover:bg-indigo-50/20 cursor-pointer'
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
                                    <div className="p-3 bg-indigo-100 rounded-full">
                                        <FileText className="h-8 w-8 text-indigo-600" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-medium text-indigo-950">{selectedFile.name}</p>
                                    <p className="text-sm text-indigo-600/70">
                                        {formatFileSize(selectedFile.size)}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
                                    <div className={`p-3 rounded-full ${isMaintenance ? 'bg-amber-100' : 'bg-indigo-50 hover:bg-indigo-100'} transition-colors`}>
                                        <Upload className={`h-8 w-8 ${isMaintenance ? 'text-amber-500' : 'text-indigo-400 hover:text-indigo-600'} transition-colors`} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-lg font-medium text-indigo-950">
                                        {isMaintenance ? "File Upload Disabled" : "Drag and drop or click to browse"}
                                    </p>
                                    <p className="text-sm text-indigo-600/70">
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
                                className="w-full bg-[#0f172b] hover:bg-[#0f172b]/90 text-white shadow-lg shadow-slate-200"
                            >
                                {isUploading ? (
                                    <>
                                        <Clock className="mr-2 h-4 w-4 animate-spin" />
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
                        <Alert variant="destructive" className="mt-4 bg-red-50 border-red-100 text-red-900">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <AlertDescription className="text-red-800">{error}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* Upload Information Panel */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden h-fit">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <FileCheck className="h-5 w-5 text-slate-500" />
                        Processing Status
                    </CardTitle>
                    <CardDescription>
                        {uploadStats ? 'Upload completed successfully' : 'Real-time processing updates'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isUploading ? (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-blue-900 font-medium">Upload Progress</span>
                                    <span className="text-blue-700 font-bold">{Math.round(uploadProgress)}%</span>
                                </div>
                                <Progress value={uploadProgress} className="w-full h-2 bg-blue-100" />
                            </div>
                            <div className="text-sm text-blue-600/80 animate-pulse">
                                Analyzing records and preparing for queue...
                            </div>
                        </div>
                    ) : uploadStats ? (
                        <div className="space-y-4">
                            <div className="grid gap-3">
                                <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100/50">
                                    <span className="text-sm font-medium text-blue-900">Email Count:</span>
                                    <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 font-bold">
                                        {uploadStats.emailCount.toLocaleString()}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100/50">
                                    <span className="text-sm font-medium text-blue-900">Duplicates Removed:</span>
                                    <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 font-bold">
                                        {uploadStats.duplicateCount.toLocaleString()}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100/50">
                                    <span className="text-sm font-medium text-blue-900">Job Reference:</span>
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 font-mono">
                                        {uploadStats.jobId}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-md border border-blue-100/50">
                                    <span className="text-sm font-medium text-blue-900">Original File:</span>
                                    <span className="text-xs text-blue-600 truncate max-w-[150px] font-medium">
                                        {uploadStats.fileName}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-2">
                                <Button variant="outline" size="sm" asChild className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50">
                                    <Link href="/dashboard/jobs">
                                        <Eye className="mr-2 h-4 w-4" /> View Jobs
                                    </Link>
                                </Button>
                                <Button variant="outline" size="sm" asChild className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50">
                                    <a href={`/next-api/proxy/jobs/download?jobId=${uploadStats.jobId}&format=csv`} target="_blank" rel="noopener noreferrer">
                                        <Download className="mr-2 h-4 w-4" /> Download
                                    </a>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="inline-flex items-center justify-center p-4 bg-slate-50 rounded-full mb-4">
                                <Clock className="h-8 w-8 text-slate-300" />
                            </div>
                            <p className="text-slate-600 font-medium">Ready to Process</p>
                            <p className="text-sm text-slate-400 mt-1 max-w-[200px] mx-auto">
                                Upload a file to see Processing details and Job ID
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
