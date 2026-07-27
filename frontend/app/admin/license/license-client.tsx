"use client"

import { useState, useRef, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck, ArrowUpCircle, Key, RefreshCcw, CheckCircle, Download, UploadCloud, FileArchive, Database, History, HardDriveDownload, RotateCcw, AlertCircle, Loader2, Trash2, Wrench, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ApiClient } from "@/lib/api-client"

// ─── Types ──────────────────────────────────────────────────────────────────

export type LicenseInfo = {
    version: string
    author?: string
    license_status: string
    license_key: string
    release_date: string
}

export type BackupFile = {
    id: number
    name: string
    type: string
    size: string
    date: string
}

type UpdateStatus = "idle" | "dragging" | "uploading" | "installing" | "latest" | "error"

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const licenseSchema = z.object({
    license_key: z.string()
        .min(1, "License key is required")
        .regex(
            /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i,
            "Invalid format. Expected: XXXX-XXXX-XXXX-XXXX"
        )
})

type LicenseFormValues = z.infer<typeof licenseSchema>

// ─── Component ───────────────────────────────────────────────────────────────

export function LicenseClient({ initialLicenseInfo, initialBackups }: {
    initialLicenseInfo: LicenseInfo | null
    initialBackups: BackupFile[]
}) {
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle")
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadedFile, setUploadedFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [isRestoring, setIsRestoring] = useState(false)
    const [restoreProgress, setRestoreProgress] = useState(0)
    const [showRestoreConfirm, setShowRestoreConfirm] = useState<{ id: number; name: string } | null>(null)

    const [backups, setBackups] = useState<BackupFile[]>(initialBackups)
    const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(initialLicenseInfo)
    const [isEditingLicense, setIsEditingLicense] = useState(false)
    const isFirstMount = useRef(true)

    // Maintenance Mode States
    const [maintenanceMode, setMaintenanceMode] = useState(false)
    const [maintenanceMessage, setMaintenanceMessage] = useState("We are currently optimizing our verification engine. Single/Bulk verification is temporarily paused. Your existing files are safe.")
    const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)

    const handleSaveMaintenance = async () => {
        setIsSavingMaintenance(true)
        try {
            const res = await ApiClient.post('/admin/settings/update', {
                settings: {
                    maintenance_mode: maintenanceMode ? "1" : "0",
                    maintenance_message: maintenanceMessage
                }
            })
            if (res.status === 'success') {
                toast.success("Maintenance settings updated successfully!")
                setTimeout(() => {
                    window.location.reload()
                }, 1000)
            } else {
                toast.error(res.message || "Failed to update maintenance settings")
            }
        } catch (err: any) {
            toast.error(err.message || "An error occurred while saving")
        } finally {
            setIsSavingMaintenance(false)
        }
    }

    const licenseForm = useForm<LicenseFormValues>({
        resolver: zodResolver(licenseSchema),
        defaultValues: { license_key: "" }
    })

    // ── Data fetchers ──

    const fetchSystemStatus = async () => {
        try {
            const result = await ApiClient.get<LicenseInfo>('/admin/system/status')
            if (result.status === 'success' && result.data) {
                setLicenseInfo(result.data)
            }
        } catch (error) {
            toast.error("Failed to refresh system status")
        }
    }

    const fetchBackups = async () => {
        try {
            const result = await ApiClient.get<BackupFile[]>('/admin/system/backups')
            if (result.status === 'success' && result.data) {
                setBackups(Array.isArray(result.data) ? result.data : [])
            }
        } catch (error) {
            toast.error("Failed to load backup list")
        }
    }

    const fetchMaintenanceSettings = async () => {
        try {
            const res = await ApiClient.get<any[]>('/admin/settings')
            if (res.status === 'success' && Array.isArray(res.data)) {
                const modeSetting = res.data.find(s => s.setting_key === 'maintenance_mode')
                const msgSetting = res.data.find(s => s.setting_key === 'maintenance_message')
                if (modeSetting) {
                    setMaintenanceMode(modeSetting.setting_value === '1' || modeSetting.setting_value === 'true')
                }
                if (msgSetting) {
                    setMaintenanceMessage(msgSetting.setting_value || "")
                }
            }
        } catch (err) {
            console.error("Failed to load maintenance settings:", err)
        }
    }

    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
        }
        fetchSystemStatus()
        fetchBackups()
        fetchMaintenanceSettings()
    }, [])

    // ── License key form ──

    const onLicenseSubmit = async (values: LicenseFormValues) => {
        try {
            const res = await ApiClient.post<LicenseInfo>('/admin/system/license', {
                license_key: values.license_key
            })
            if (res.status === 'success' && res.data) {
                setLicenseInfo(prev => prev ? { ...prev, ...res.data } : res.data!)
                setIsEditingLicense(false)
                licenseForm.reset()
                toast.success("License activated successfully")
            } else {
                toast.error(res.message || "Failed to activate license key")
            }
        } catch (error: any) {
            toast.error(error.message || "An unexpected error occurred")
        }
    }

    // ── File upload (XHR for progress) ──

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
                    setUploadProgress(Math.round((event.loaded / event.total) * 100))
                }
            }

            xhr.onload = () => {
                if (xhr.status === 200) {
                    setUpdateStatus("installing")
                    setTimeout(() => {
                        setUpdateStatus("latest")
                        fetchSystemStatus()
                    }, 2000)
                } else {
                    let errMsg = "Upload failed"
                    try {
                        const parsed = JSON.parse(xhr.responseText)
                        errMsg = parsed.message || errMsg
                    } catch (_) {}
                    toast.error(errMsg)
                    setUpdateStatus("error")
                }
            }

            xhr.onerror = () => {
                toast.error("Upload failed. Please check your connection.")
                setUpdateStatus("error")
            }

            xhr.send(formData)
        } catch (error: any) {
            toast.error(error.message || "Failed to upload update package")
            setUpdateStatus("error")
        }
    }

    // ── Backup operations ──

    const generateBackup = async (type: string) => {
        setIsBackingUp(true)
        const toastId = toast.loading(`Creating ${type} backup...`)
        try {
            const result = await ApiClient.post('/admin/system/backups', { type })
            if (result.status === 'success') {
                toast.success(`${type} backup created successfully`, { id: toastId })
                fetchBackups()
            } else {
                toast.error(result.message || "Backup failed", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Backup failed", { id: toastId })
        } finally {
            setIsBackingUp(false)
        }
    }

    const deleteBackup = async (name: string) => {
        const toastId = toast.loading("Deleting backup...")
        try {
            const result = await ApiClient.delete(`/admin/system/backups?name=${name}`)
            if (result.status === 'success') {
                setBackups(prev => prev.filter(b => b.name !== name))
                toast.success("Backup deleted", { id: toastId })
            } else {
                toast.error(result.message || "Failed to delete backup", { id: toastId })
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to delete backup", { id: toastId })
        }
    }

    // ── Restore ──

    const startRestore = async () => {
        if (!showRestoreConfirm) return
        const target = showRestoreConfirm
        setShowRestoreConfirm(null)
        setIsRestoring(true)
        setRestoreProgress(10)

        try {
            const res = await ApiClient.post('/admin/system/backups/restore', { name: target.name })
            if (res.status === 'success') {
                setRestoreProgress(100)
                toast.success("Database restored successfully!")
                fetchSystemStatus()
            } else {
                toast.error(res.message || "Failed to restore database")
            }
        } catch (err: any) {
            toast.error(err.message || "Connection error during restore")
        } finally {
            setTimeout(() => setIsRestoring(false), 1000)
        }
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
        if (files && files.length > 0) handleFileSelect(files[0])
    }

    const backupList = Array.isArray(backups) ? backups : []

    return (
        <div className="flex-1 space-y-6 pb-10 relative">
            {/* Restoration Overlay */}
            {isRestoring && (
                <div className="absolute inset-0 z-50 bg-[#0b1f1c]/60 backdrop-blur-sm rounded-xl flex items-center justify-center p-6">
                    <Card className="w-full max-w-md shadow-2xl border-[#0f5c52]/30">
                        <CardContent className="pt-8 pb-8 space-y-6 text-center">
                            <div className="h-16 w-16 rounded-full bg-[#0f5c52]/10 flex items-center justify-center mx-auto mb-4">
                                <RefreshCcw className="h-8 w-8 text-[#0f5c52] animate-spin" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-[#0b1f1c]">System Restoration in Progress</h3>
                                <p className="text-sm text-[#5a736c]">Restoring files and database from backup. Please wait and do not refresh the page.</p>
                            </div>
                            <div className="space-y-2">
                                <Progress value={restoreProgress} className="h-2" indicatorClassName="bg-[#0f5c52]" />
                                <p className="text-xs font-bold text-[#0f5c52] uppercase tracking-widest">{restoreProgress}% Complete</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Restore Confirm Modal */}
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
                                Are you sure you want to restore <span className="font-bold text-[#0b1f1c]">{showRestoreConfirm.name}</span>?
                                <br /><br />
                                <span className="text-red-500 font-semibold italic text-xs">Warning: Current data will be overwritten!</span>
                            </p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" size="sm" onClick={() => setShowRestoreConfirm(null)}>Cancel</Button>
                                <Button className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none" size="sm" onClick={startRestore}>Yes, Restore Now</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Update and Licence</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Manage system versions, licenses, and data security.</p>
                </div>
            </div>

            {/* Maintenance Live Preview Banner */}
            {maintenanceMode && (
                <div className="w-full bg-amber-50/80 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex items-start gap-3 border border-amber-100/50 animate-pulse">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                            System Maintenance Mode Active
                        </h4>
                        <p className="text-xs text-amber-700 mt-1">{maintenanceMessage}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                        Live Banner Preview
                    </span>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* License Card */}
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden h-full">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <ShieldCheck className="h-5 w-5 text-emerald-500" /> Licence Information
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Manage your application license and subscription status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="flex justify-between items-center p-4 rounded-xl bg-[#f0f4f2]/60 border border-[#0b1f1c]/8">
                            <div>
                                <p className="text-xs text-[#5a736c] uppercase font-bold tracking-wider mb-1">Subscription Status</p>
                                <p className="text-base font-bold text-emerald-600 flex items-center gap-1.5">
                                    <CheckCircle className="h-4 w-4" /> {licenseInfo?.license_status || "Checking..."}
                                </p>
                            </div>
                            <Button size="sm" variant="outline" className="bg-white hover:bg-[#f0f4f2]/60" onClick={fetchSystemStatus}>
                                <RefreshCcw className="h-3.5 w-3.5 mr-1.5 text-[#5a736c]" /> Refresh
                            </Button>
                        </div>

                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[#5a736c] uppercase tracking-wider">Licence Key</label>
                            {isEditingLicense ? (
                                <form onSubmit={licenseForm.handleSubmit(onLicenseSubmit)} className="space-y-2">
                                    <div className="flex gap-2">
                                        <Input
                                            {...licenseForm.register("license_key")}
                                            placeholder="XXXX-XXXX-XXXX-XXXX"
                                            className={cn(
                                                "flex-1 font-mono uppercase",
                                                licenseForm.formState.errors.license_key && "border-red-400"
                                            )}
                                            disabled={licenseForm.formState.isSubmitting}
                                        />
                                        <Button
                                            type="submit"
                                            disabled={licenseForm.formState.isSubmitting}
                                            className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none shrink-0"
                                        >
                                            {licenseForm.formState.isSubmitting
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : "Save"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setIsEditingLicense(false)
                                                licenseForm.reset()
                                            }}
                                            disabled={licenseForm.formState.isSubmitting}
                                            className="bg-white shrink-0"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                    {licenseForm.formState.errors.license_key && (
                                        <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                                            <AlertCircle className="h-3.5 w-3.5" />
                                            {licenseForm.formState.errors.license_key.message}
                                        </p>
                                    )}
                                    <p className="text-[10px] text-[#6b857c]">
                                        Format: 16 alphanumeric characters separated by dashes (e.g. A1B2-C3D4-E5F6-G7H8)
                                    </p>
                                </form>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="flex-1 px-4 py-2.5 rounded-lg border border-[#0b1f1c]/10 bg-[#f0f4f2]/60 font-mono text-sm text-[#0b1f1c] flex items-center shadow-inner">
                                        {licenseInfo?.license_key ? licenseInfo.license_key : "XXXX-XXXX-XXXX-XXXX"}
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-10 w-10 shrink-0 bg-white"
                                        onClick={() => {
                                            setIsEditingLicense(true)
                                            licenseForm.reset()
                                        }}
                                    >
                                        <Key className="h-4 w-4 text-[#0f5c52]" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Software Update Card */}
                <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden h-full flex flex-col">
                    <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <ArrowUpCircle className="h-5 w-5 text-[#0f5c52]" /> Software Update
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Upload update packages to upgrade your system.</CardDescription>
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
                                        ? "border-[#0f5c52] bg-[#0f5c52]/5 scale-[0.99]"
                                        : "border-[#0b1f1c]/10 hover:border-[#0f5c52]/40 hover:bg-[#f0f4f2]/40"
                                )}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                                    className="hidden"
                                    accept=".zip,.pkg"
                                />
                                <div className="h-12 w-12 rounded-full bg-[#0f5c52]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                                    <UploadCloud className="h-6 w-6 text-[#0f5c52]" />
                                </div>
                                <h3 className="text-sm font-semibold text-[#0b1f1c] mb-1">Drop update file here</h3>
                                <p className="text-xs text-[#5a736c]">or click to browse from your computer</p>
                                <p className="text-[10px] text-[#6b857c] mt-4 uppercase font-bold tracking-tighter">Supported: .ZIP, .PKG</p>
                            </div>
                        ) : (
                            <div className="space-y-4 py-4">
                                {updateStatus === "uploading" && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-[#0f5c52]/10 flex items-center justify-center">
                                                <FileArchive className="h-5 w-5 text-[#0f5c52]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-[#0b1f1c] truncate">{uploadedFile?.name}</p>
                                                <p className="text-xs text-[#5a736c]">Uploading package...</p>
                                            </div>
                                        </div>
                                        <Progress value={uploadProgress} className="h-2" indicatorClassName="bg-[#0f5c52]" />
                                        <div className="flex justify-between text-[10px] font-bold uppercase text-[#6b857c] tracking-wider">
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
                                    <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col items-center text-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                                            <CheckCircle className="h-6 w-6 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-emerald-900">System Updated Successfully</p>
                                            <p className="text-xs text-emerald-700">Your application is now running the latest version.</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={resetUpdate}>Done</Button>
                                    </div>
                                )}

                                {updateStatus === "error" && (
                                    <div className="p-6 rounded-xl bg-rose-50 border border-rose-100 flex flex-col items-center text-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center">
                                            <AlertCircle className="h-6 w-6 text-rose-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-rose-900">Upload Failed</p>
                                            <p className="text-xs text-rose-700">Please try again or check the server logs.</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={resetUpdate}>Try Again</Button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-center justify-between text-[10px] text-[#6b857c] pt-4 uppercase font-bold tracking-widest">
                            <span>Author: {licenseInfo?.author || "Sohel Akter"}</span>
                            <span>Version: {licenseInfo?.version !== undefined ? licenseInfo.version : ""}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* System Maintenance (Horizontal Card) */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Wrench className="h-5 w-5 text-amber-500" /> System Maintenance Control
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Configure global maintenance mode to perform safe database or server upgrades.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-[#0b1f1c]/8 shadow-none shrink-0">
                        <div className="text-right">
                            <p className="text-xs font-semibold text-[#0b1f1c]">Maintenance Status</p>
                            <p className="text-[10px] text-[#5a736c]">
                                {maintenanceMode ? "New validations blocked" : "System fully operational"}
                            </p>
                        </div>
                        <Switch
                            checked={maintenanceMode}
                            onCheckedChange={(checked) => {
                                setMaintenanceMode(checked)
                                if (checked) {
                                    toast.success("Maintenance Mode enabled in preview")
                                } else {
                                    toast("Maintenance Mode disabled in preview", { icon: "⚙️" })
                                }
                            }}
                        />
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid gap-6 md:grid-cols-12 items-start">
                        {/* Message Input & Draining Info (7 cols) */}
                        <div className="md:col-span-7 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-[#5a736c] uppercase tracking-wider">
                                    Notification Banner Message
                                </Label>
                                <Textarea
                                    value={maintenanceMessage}
                                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                                    placeholder="Enter maintenance banner message for users..."
                                    className="min-h-[90px] resize-none text-xs focus-visible:ring-amber-500"
                                    disabled={!maintenanceMode}
                                />
                            </div>
                            <div className="rounded-lg bg-amber-50/50 border border-amber-100/50 p-3.5 text-xs text-amber-800 leading-relaxed flex gap-2">
                                <span className="text-base shrink-0">💡</span>
                                <div>
                                    <strong className="font-semibold">Graceful Queue Draining:</strong> While active, already running bulk jobs will continue to process until finished. Only new uploads, verifications, and API validations are blocked. User area and Reseller area will be blocked from performing new operations.
                                </div>
                            </div>
                        </div>

                        {/* Banner Preview & Save Action (5 cols) */}
                        <div className="md:col-span-5 space-y-4 flex flex-col justify-between min-h-[175px]">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-[#5a736c] uppercase tracking-wider">
                                    Real-time Banner Preview
                                </Label>
                                <div className={cn(
                                    "p-4 rounded-xl border text-xs transition-all duration-300 min-h-[90px] flex items-center justify-center",
                                    maintenanceMode 
                                        ? "bg-amber-50/80 border-amber-200 text-amber-900 shadow-inner" 
                                        : "bg-[#f0f4f2]/60 border-[#0b1f1c]/10 text-[#6b857c] italic"
                                )}>
                                    {maintenanceMode ? (
                                        <div className="flex gap-2 items-start">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="leading-relaxed">{maintenanceMessage}</p>
                                        </div>
                                    ) : (
                                        "Toggle Maintenance Status to see preview"
                                    )}
                                </div>
                            </div>

                            <Button
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-none transition-colors duration-200"
                                size="sm"
                                disabled={isSavingMaintenance}
                                onClick={handleSaveMaintenance}
                            >
                                {isSavingMaintenance ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving settings...
                                    </>
                                ) : (
                                    "Save Maintenance Settings"
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* System Backup Card */}
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Database className="h-5 w-5 text-[#0f5c52]" /> System Backup & Recovery
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Generate and download full system, database, or user details backups.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={() => generateBackup("Full System")}
                            disabled={isBackingUp}
                            size="sm"
                            className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none"
                        >
                            {isBackingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <HardDriveDownload className="h-3.5 w-3.5 mr-2" />}
                            Full Backup
                        </Button>
                        <Button onClick={() => generateBackup("Database")} disabled={isBackingUp} size="sm" variant="outline" className="bg-white">DB Only</Button>
                        <Button onClick={() => generateBackup("User Details")} disabled={isBackingUp} size="sm" variant="outline" className="bg-white">User Details</Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6b857c] uppercase tracking-wider mb-2">
                            <History className="h-3.5 w-3.5" /> Backup History
                        </div>
                        <div className="grid gap-3">
                            {backupList.length === 0 ? (
                                <p className="text-sm text-[#6b857c] text-center py-6">No backups yet. Create your first backup above.</p>
                            ) : backupList.map((backup) => (
                                <div key={backup.id} className="flex items-center justify-between p-3 rounded-lg border border-[#0b1f1c]/8 bg-white hover:bg-[#f0f4f2]/40 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-[#f0f4f2]/60 flex items-center justify-center group-hover:bg-[#0f5c52]/10 transition-colors">
                                            {backup.type === "Full System" ? <UploadCloud className="h-4 w-4 text-[#6b857c] group-hover:text-[#0f5c52]" /> :
                                             backup.type === "Database" ? <Database className="h-4 w-4 text-[#6b857c] group-hover:text-[#0f5c52]" /> :
                                             <FileArchive className="h-4 w-4 text-[#6b857c] group-hover:text-[#0f5c52]" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold text-[#0b1f1c]">{backup.name}</p>
                                                <span className="px-1.5 py-0.5 rounded-full bg-[#0b1f1c]/5 text-[9px] font-bold text-[#5a736c] uppercase tracking-tighter">
                                                    {backup.type}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-[#6b857c]">{backup.date} • {backup.size}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="icon" variant="ghost" title="Restore"
                                            className="h-8 w-8 text-[#6b857c] hover:text-[#0f5c52]"
                                            onClick={() => setShowRestoreConfirm({ id: backup.id, name: backup.name })}
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-[#6b857c] hover:text-[#0f5c52]">
                                            <Download className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-8 w-8 text-[#6b857c] hover:text-rose-500"
                                            onClick={() => deleteBackup(backup.name)}
                                        >
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
            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <History className="h-5 w-5 text-[#6b857c]" /> Version Changelog
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">Recent release notes and patch history.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-2">
                    <div className="relative border-l-2 border-[#0b1f1c]/8 ml-2 space-y-6 pb-2">
                        <div className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-[#0f5c52] border-2 border-white shadow-none flex items-center justify-center ring-2 ring-[#0f5c52]/15" />
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-bold text-[#0b1f1c] text-sm">{licenseInfo?.version !== undefined ? licenseInfo.version : ""}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0f5c52] text-white tracking-wide">Latest</span>
                                <span className="text-xs text-[#6b857c]">{licenseInfo?.release_date || "Feb 20, 2024"}</span>
                            </div>
                            <p className="text-sm text-[#5a736c]">New bulk verification engine, 40% faster throughput.</p>
                        </div>
                        <div className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-[#0b1f1c]/20 border-2 border-white shadow-none ring-2 ring-[#0b1f1c]/5" />
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-bold text-[#0b1f1c] text-sm">v2.3.8</span>
                                <span className="text-xs text-[#6b857c]">Jan 30, 2024</span>
                            </div>
                            <p className="text-sm text-[#5a736c]">Security patch: hardened API key validation.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
