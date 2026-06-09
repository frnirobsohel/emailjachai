"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/common/card"
import { ShieldCheck, ArrowUpCircle, Key, RefreshCcw, CheckCircle, Download, UploadCloud, FileArchive, Database, History, HardDriveDownload, FileText, Trash2, RotateCcw, AlertCircle } from "lucide-react"
import { Button } from "@/components/common/button"
import { Progress } from "@/components/common/progress"
import { Input } from "@/components/common/input"
import { Label } from "@/components/common/label"
import { cn } from "@/lib/utils"
import { ApiClient } from "@/lib/api-client"

type UpdateStatus = "idle" | "dragging" | "uploading" | "installing" | "latest" | "error"

export function LicenseClient({ initialLicenseInfo, initialBackups }: { initialLicenseInfo: any, initialBackups: any[] }) {
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle")
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadedFile, setUploadedFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [isRestoring, setIsRestoring] = useState(false)
    const [restoreProgress, setRestoreProgress] = useState(0)
    const [showRestoreConfirm, setShowRestoreConfirm] = useState<{id: number, name: string} | null>(null)

    const [backups, setBackups] = useState<any[]>(initialBackups)
    const [licenseInfo, setLicenseInfo] = useState<any>(initialLicenseInfo)
    const [isLoading, setIsLoading] = useState(false)

    const [isEditingLicense, setIsEditingLicense] = useState(false)
    const [newLicenseKey, setNewLicenseKey] = useState("")
    const [isActivating, setIsActivating] = useState(false)
    const [licenseError, setLicenseError] = useState("")

    const fetchSystemStatus = async () => {
        try {
            const result = await ApiClient.get('/admin/system/status')
            if (result.status === 'success') {
                setLicenseInfo(result.data)
            }
        } catch (error) {
            console.error("Failed to fetch system status:", error)
        }
    }

    const fetchBackups = async () => {
        setIsLoading(true)
        try {
            const result = await ApiClient.get('/admin/system/backups')
            if (result.status === 'success') {
                setBackups(Array.isArray(result.data) ? result.data : [])
            }
        } catch (error) {
            setBackups([])
            console.error("Failed to fetch backups:", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        // fetchSystemStatus() // Handled by SSR initialData
        // fetchBackups() // Handled by SSR initialData
    }, [])

    const backupList = Array.isArray(backups) ? backups : []

    const handleSaveLicense = async () => {
        setIsActivating(true)
        setLicenseError("")
        try {
            const res = await ApiClient.post<any>('/admin/system/license', {
                license_key: newLicenseKey
            })
            if (res.status === 'success') {
                setIsEditingLicense(false)
                fetchSystemStatus()
            } else {
                setLicenseError(res.message || "Failed to activate license key")
            }
        } catch (error: any) {
            setLicenseError(error.message || "An unexpected error occurred")
        } finally {
            setIsActivating(false)
        }
    }

    const handleFileSelect = async (file: File) => {
        setUploadedFile(file)
        setUpdateStatus("uploading")
        setUploadProgress(0)

        const formData = new FormData()
        formData.append("file", file)

        try {
            const xhr = new XMLHttpRequest()
            const uploadUrl = `${ApiClient.getBaseUrl()}/system/update`
            xhr.open("POST", uploadUrl, true)

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentage = Math.round((event.loaded / event.total) * 100)
                    setUploadProgress(percentage)
                }
            }

            xhr.onload = () => {
                if (xhr.status === 200) {
                    setUpdateStatus("installing")
                    setTimeout(() => {
                        setUpdateStatus("latest")
                        fetchSystemStatus() // update version
                    }, 2000)
                } else {
                    try {
                        const parsed = JSON.parse(xhr.responseText)
                        console.error("Upload failed:", parsed)
                    } catch (_) {}
                    setUpdateStatus("error")
                }
            }

            xhr.onerror = () => {
                setUpdateStatus("error")
            }

            xhr.send(formData)
        } catch (error) {
            console.error("Failed to upload update:", error)
            setUpdateStatus("error")
        }
    }

    const generateBackup = async (type: string) => {
        setIsBackingUp(true)
        try {
            const result = await ApiClient.post('/admin/system/backups', { type })
            if (result.status === 'success') {
                fetchBackups()
            }
        } catch (error) {
            console.error("Backup failed:", error)
        } finally {
            setIsBackingUp(false)
        }
    }

    const deleteBackup = async (name: string) => {
        try {
            const result = await ApiClient.delete(`/admin/system/backups?name=${name}`)
            if (result.status === 'success') {
                fetchBackups()
            }
        } catch (error) {
            console.error("Delete failed:", error)
        }
    }

    const startRestore = () => {
        if (!showRestoreConfirm) return
        setShowRestoreConfirm(null)
        setIsRestoring(true)
        setRestoreProgress(0)

        let progress = 0
        const interval = setInterval(() => {
            progress += 5
            setRestoreProgress(progress)
            if (progress >= 100) {
                clearInterval(interval)
                setTimeout(() => {
                    setIsRestoring(false)
                }, 1000)
            }
        }, 150)
    }

    const resetUpdate = () => {
        setUpdateStatus("idle")
        setUploadProgress(0)
        setUploadedFile(null)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (updateStatus === "idle") setUpdateStatus("dragging")
    }

    const handleDragLeave = () => {
        if (updateStatus === "dragging") setUpdateStatus("idle")
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            handleFileSelect(files[0])
        }
    }

    return (
        <div className="flex-1 space-y-6 pb-10 relative">
            {/* Restoration Overlay */}
            {isRestoring && (
                <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center p-6">
                    <Card className="w-full max-w-md shadow-2xl border-indigo-500/50">
                        <CardContent className="pt-8 pb-8 space-y-6 text-center">
                            <div className="h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                                <RefreshCcw className="h-8 w-8 text-indigo-600 animate-spin" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-slate-900">System Restoration in Progress</h3>
                                <p className="text-sm text-slate-500">Restoring files and database from backup. Please wait and do not refresh the page.</p>
                            </div>
                            <div className="space-y-2">
                                <Progress value={restoreProgress} className="h-2" />
                                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{restoreProgress}% Complete</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Confirmation Modal */}
            {showRestoreConfirm && (
                <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center p-6">
                    <Card className="w-full max-w-sm shadow-xl border-amber-100">
                        <CardHeader className="bg-amber-50/50 border-b border-amber-100">
                            <CardTitle className="text-lg font-bold text-amber-900 flex items-center gap-2">
                                <RotateCcw className="h-5 w-5" /> Confirm Restore
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4 text-center">
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Are you sure you want to restore <span className="font-bold text-slate-900">{showRestoreConfirm.name}</span>? 
                                <br /><br />
                                <span className="text-red-500 font-semibold italic text-xs">Warning: Current data will be overwritten!</span>
                            </p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" size="sm" onClick={() => setShowRestoreConfirm(null)}>Cancel</Button>
                                <Button className="bg-indigo-600 hover:bg-indigo-700" size="sm" onClick={startRestore}>Yes, Restore Now</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Update and Licence</h2>
                    <p className="text-slate-500">Manage system versions, licenses, and data security.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* License Card */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden h-full">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <ShieldCheck className="h-5 w-5 text-green-500" /> Licence Information
                        </CardTitle>
                        <CardDescription>Manage your application license and subscription status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex justify-between items-center p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <div>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Subscription Status</p>
                                <p className="text-base font-bold text-green-600 flex items-center gap-1.5">
                                    <CheckCircle className="h-4 w-4" /> {licenseInfo?.license_status || "Checking..."}
                                </p>
                            </div>
                            <Button size="sm" variant="outline" className="bg-white hover:bg-slate-50" onClick={fetchSystemStatus}>
                                <RefreshCcw className="h-3.5 w-3.5 mr-1.5 text-slate-500" /> Refresh
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Licence Key</label>
                            {isEditingLicense ? (
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <Input
                                            value={newLicenseKey}
                                            onChange={(e) => setNewLicenseKey(e.target.value)}
                                            placeholder="XXXX-XXXX-XXXX-XXXX"
                                            className="flex-1 font-mono uppercase"
                                            disabled={isActivating}
                                        />
                                        <Button
                                            onClick={handleSaveLicense}
                                            disabled={isActivating || !newLicenseKey}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                                        >
                                            {isActivating ? "Saving..." : "Save"}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setIsEditingLicense(false)
                                                setLicenseError("")
                                            }}
                                            disabled={isActivating}
                                            className="bg-white shrink-0"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                    {licenseError && (
                                        <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                                            <AlertCircle className="h-3.5 w-3.5" /> {licenseError}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-slate-400">
                                        Format: 16 alphanumeric characters separated by dashes (e.g. A1B2-C3D4-E5F6-G7H8)
                                    </p>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="flex-1 px-4 py-2.5 rounded-lg border bg-slate-50 font-mono text-sm text-slate-700 flex items-center shadow-inner">
                                        {licenseInfo?.license_key ? licenseInfo.license_key : "XXXX-XXXX-XXXX-XXXX"}
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-10 w-10 shrink-0 bg-white"
                                        onClick={() => {
                                            setIsEditingLicense(true)
                                            setNewLicenseKey("")
                                            setLicenseError("")
                                        }}
                                    >
                                        <Key className="h-4 w-4 text-indigo-500" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Software Update Card */}
                <Card className="shadow-sm border-indigo-100 overflow-hidden h-full flex flex-col">
                    <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <ArrowUpCircle className="h-5 w-5 text-indigo-500" /> Software Update
                        </CardTitle>
                        <CardDescription>Upload update packages to upgrade your system.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 pt-6 flex flex-col justify-center">
                        {updateStatus === "idle" || updateStatus === "dragging" ? (
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "relative group cursor-pointer border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center text-center",
                                    updateStatus === "dragging"
                                        ? "border-indigo-500 bg-indigo-50/50 scale-[0.99]"
                                        : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
                                )}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                                    className="hidden"
                                    accept=".zip,.pkg"
                                />
                                <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                                    <UploadCloud className="h-6 w-6 text-indigo-500" />
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 mb-1">Drop update file here</h3>
                                <p className="text-xs text-slate-500">or click to browse from your computer</p>
                                <p className="text-[10px] text-slate-400 mt-4 uppercase font-bold tracking-tighter">Supported: .ZIP, .PKG</p>
                            </div>
                        ) : (
                            <div className="space-y-4 py-4">
                                {updateStatus === "uploading" && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                <FileArchive className="h-5 w-5 text-indigo-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 truncate">{uploadedFile?.name}</p>
                                                <p className="text-xs text-slate-500">Uploading package...</p>
                                            </div>
                                        </div>
                                        <Progress value={uploadProgress} className="h-2" />
                                        <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                            <span>{uploadProgress}% Complete</span>
                                            <span>Uploading...</span>
                                        </div>
                                    </div>
                                )}
 
                                {updateStatus === "installing" && (
                                    <div className="p-6 rounded-xl bg-amber-50 border border-amber-100 flex flex-col items-center text-center gap-3 animate-pulse">
                                        <RefreshCcw className="h-8 w-8 text-amber-500 animate-spin" />
                                        <div>
                                            <p className="text-sm font-bold text-amber-900">Installing Update</p>
                                            <p className="text-xs text-amber-700">Please do not close this window or refresh the page.</p>
                                        </div>
                                    </div>
                                )}
 
                                {updateStatus === "latest" && (
                                    <div className="p-6 rounded-xl bg-green-50 border border-green-100 flex flex-col items-center text-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                            <CheckCircle className="h-6 w-6 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-green-900">System Updated Successfully</p>
                                            <p className="text-xs text-green-700">Your application is now running the latest version.</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={resetUpdate}>
                                            Done
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-4 uppercase font-bold tracking-widest">
                            <span>Current: {licenseInfo?.version || "v2.4.0"}</span>
                            <span>Release: {licenseInfo?.release_date || "2026-04-20"}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* System Backup Card */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <Database className="h-5 w-5 text-indigo-500" /> System Backup & Recovery
                        </CardTitle>
                        <CardDescription>Generate and download full system, database, or conversation backups.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => generateBackup("Full System")}
                            disabled={isBackingUp}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        >
                            {isBackingUp ? <RefreshCcw className="h-3.5 w-3.5 animate-spin mr-2" /> : <HardDriveDownload className="h-3.5 w-3.5 mr-2" />}
                            Full Backup
                        </Button>
                        <Button
                            onClick={() => generateBackup("Database")}
                            disabled={isBackingUp}
                            size="sm"
                            variant="outline"
                            className="bg-white"
                        >
                            DB Only
                        </Button>
                        <Button
                            onClick={() => generateBackup("Conversation")}
                            disabled={isBackingUp}
                            size="sm"
                            variant="outline"
                            className="bg-white"
                        >
                            Chats
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            <History className="h-3.5 w-3.5" /> Backup History
                        </div>
                        <div className="grid gap-3">
                            {backupList.map((backup) => (
                                <div key={backup.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                            {backup.type === "Full System" ? <UploadCloud className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" /> :
                                             backup.type === "Database" ? <Database className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" /> :
                                             <FileArchive className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold text-slate-900">{backup.name}</p>
                                                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                                                    {backup.type}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">{backup.date} • {backup.size}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            title="Restore"
                                            className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                                            onClick={() => setShowRestoreConfirm({id: backup.id, name: backup.name})}
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600">
                                            <Download className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={() => deleteBackup(backup.name)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Version Changelog */}
            <Card className="shadow-sm border-indigo-100 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-indigo-50/50">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                        <History className="h-5 w-5 text-slate-400" /> Version Changelog
                    </CardTitle>
                    <CardDescription>Recent release notes and patch history.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-2">
                    <div className="relative border-l-2 border-slate-100 ml-2 space-y-6 pb-2">
                        <div className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-indigo-600 border-2 border-white shadow-sm flex items-center justify-center ring-2 ring-indigo-100" />
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-bold text-slate-900 text-sm">{licenseInfo?.version || "v2.4.0"}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white tracking-wide">Latest</span>
                                <span className="text-xs text-slate-400">{licenseInfo?.release_date || "Feb 20, 2024"}</span>
                            </div>
                            <p className="text-sm text-slate-600">New bulk verification engine, 40% faster throughput.</p>
                        </div>
                        <div className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-slate-300 border-2 border-white shadow-sm ring-2 ring-slate-100" />
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-bold text-slate-900 text-sm">v2.3.8</span>
                                <span className="text-xs text-slate-400">Jan 30, 2024</span>
                            </div>
                            <p className="text-sm text-slate-600">Security patch: hardened API key validation.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
