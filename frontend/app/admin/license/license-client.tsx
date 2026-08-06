"use client"

import { useState, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ShieldCheck, Key, RefreshCcw, CheckCircle, Download, UploadCloud,
    FileArchive, Database, History, HardDriveDownload, RotateCcw, AlertCircle, Loader2,
    Trash2, Wrench, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ApiClient } from "@/lib/api-client"

export type LicenseInfo = {
    version: string
    author?: string
    license_status: string
    license_key: string
    release_date: string
    release_notes?: string
    update_applies_code?: boolean
}

export type BackupFile = {
    id: number
    name: string
    type: string
    size: string
    date: string
}

const licenseSchema = z.object({
    license_key: z.string()
        .min(1, "License key is required")
        .regex(
            /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i,
            "Invalid format. Expected: XXXX-XXXX-XXXX-XXXX"
        ),
})

type LicenseFormValues = z.infer<typeof licenseSchema>

export function LicenseClient({
    initialLicenseInfo,
    initialBackups,
    initialMaintenanceMode,
    initialMaintenanceMessage,
}: {
    initialLicenseInfo: LicenseInfo | null
    initialBackups: BackupFile[]
    initialMaintenanceMode: boolean
    initialMaintenanceMessage: string
}) {
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [isRestoring, setIsRestoring] = useState(false)
    const [isUploadingBackup, setIsUploadingBackup] = useState(false)
    const [backupUploadStatus, setBackupUploadStatus] = useState<"idle" | "dragging">("idle")
    const backupFileInputRef = useRef<HTMLInputElement>(null)
    const [showRestoreConfirm, setShowRestoreConfirm] = useState<{ id: number; name: string; type: string } | null>(null)

    const [backups, setBackups] = useState<BackupFile[]>(initialBackups)
    const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(initialLicenseInfo)
    const [isEditingLicense, setIsEditingLicense] = useState(false)

    const [maintenanceMode, setMaintenanceMode] = useState(initialMaintenanceMode)
    const [maintenanceMessage, setMaintenanceMessage] = useState(initialMaintenanceMessage)
    const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)

    const licenseForm = useForm<LicenseFormValues>({
        resolver: zodResolver(licenseSchema),
        defaultValues: { license_key: "" },
    })

    const fetchSystemStatus = async () => {
        try {
            const result = await ApiClient.get<LicenseInfo>("/admin/system/status")
            if (result.status === "success" && result.data) {
                setLicenseInfo(result.data)
            }
        } catch {
            toast.error("Failed to refresh system status")
        }
    }

    const fetchBackups = async () => {
        try {
            const result = await ApiClient.get<BackupFile[]>("/admin/system/backups")
            if (result.status === "success" && result.data) {
                setBackups(Array.isArray(result.data) ? result.data : [])
            }
        } catch {
            toast.error("Failed to load backup list")
        }
    }

    const handleSaveMaintenance = async () => {
        setIsSavingMaintenance(true)
        try {
            const res = await ApiClient.post("/admin/settings/update", {
                settings: {
                    maintenance_mode: maintenanceMode ? "1" : "0",
                    maintenance_message: maintenanceMessage,
                },
            })
            if (res.status === "success") {
                toast.success("Maintenance settings updated")
            } else {
                toast.error(res.message || "Failed to update maintenance settings")
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "An error occurred while saving")
        } finally {
            setIsSavingMaintenance(false)
        }
    }

    const onLicenseSubmit = async (values: LicenseFormValues) => {
        try {
            const res = await ApiClient.post<LicenseInfo>("/admin/system/license", {
                license_key: values.license_key,
            })
            if (res.status === "success" && res.data) {
                setLicenseInfo(prev => (prev ? { ...prev, ...res.data } : res.data!))
                setIsEditingLicense(false)
                licenseForm.reset()
                toast.success("License activated successfully")
            } else {
                toast.error(res.message || "Failed to activate license key")
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "An unexpected error occurred")
        }
    }

    const generateBackup = async (type: string) => {
        setIsBackingUp(true)
        const toastId = toast.loading(`Creating ${type} backup...`)
        try {
            const result = await ApiClient.post("/admin/system/backups", { type }, { timeout: 300_000 })
            if (result.status === "success") {
                toast.success(`${type} backup created`, { id: toastId })
                void fetchBackups()
            } else {
                toast.error(result.message || "Backup failed", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Backup failed", { id: toastId })
        } finally {
            setIsBackingUp(false)
        }
    }

    const deleteBackup = async (name: string) => {
        const toastId = toast.loading("Deleting backup...")
        try {
            const result = await ApiClient.delete(`/admin/system/backups?name=${encodeURIComponent(name)}`)
            if (result.status === "success") {
                setBackups(prev => prev.filter(b => b.name !== name))
                toast.success("Backup deleted", { id: toastId })
            } else {
                toast.error(result.message || "Failed to delete backup", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to delete backup", { id: toastId })
        }
    }

    const downloadBackup = (name: string) => {
        const url = `${ApiClient.getBaseUrl()}/admin/system/backups/download?name=${encodeURIComponent(name)}`
        window.open(url, "_blank", "noopener,noreferrer")
    }

    const uploadBackupFile = async (file: File) => {
        const lower = file.name.toLowerCase()
        if (!lower.endsWith(".sql") && !lower.endsWith(".zip") && !lower.endsWith(".json")) {
            toast.error("Supported: .sql (DB), .zip (Storage / Release), .json (User Details)")
            return
        }
        setIsUploadingBackup(true)
        setBackupUploadStatus("idle")
        const toastId = toast.loading(`Uploading ${file.name}…`)
        const formData = new FormData()
        formData.append("file", file)
        try {
            const res = await ApiClient.post<{
                kind?: string
                name?: string
                type?: string
                version?: string
                release_date?: string
                release_notes?: string
            }>(
                "/admin/system/backups/upload",
                formData,
                { timeout: 300_000 },
            )
            if (res.status === "success") {
                if (res.data?.kind === "release_metadata") {
                    toast.success(res.message || "Release metadata registered", { id: toastId })
                    setLicenseInfo((prev) => ({
                        ...(prev || {
                            version: "",
                            license_status: "",
                            license_key: "",
                            release_date: "",
                        }),
                        version: res.data!.version || prev?.version || "",
                        release_date: res.data!.release_date || prev?.release_date || "",
                        release_notes: res.data!.release_notes ?? prev?.release_notes,
                        update_applies_code: false,
                    }))
                    void fetchSystemStatus()
                } else {
                    toast.success(res.message || "Backup uploaded. Click Restore when ready.", { id: toastId })
                    void fetchBackups()
                }
            } else {
                toast.error(res.message || "Upload failed", { id: toastId })
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Upload failed", { id: toastId })
        } finally {
            setIsUploadingBackup(false)
            if (backupFileInputRef.current) backupFileInputRef.current.value = ""
        }
    }

    const startRestore = async () => {
        if (!showRestoreConfirm) return
        const target = showRestoreConfirm
        setShowRestoreConfirm(null)
        setIsRestoring(true)
        try {
            const res = await ApiClient.post("/admin/system/backups/restore", { name: target.name }, { timeout: 300_000 })
            if (res.status === "success") {
                toast.success(res.message || `${target.type} restored successfully`)
                void fetchSystemStatus()
                void fetchBackups()
            } else {
                toast.error(res.message || "Failed to restore backup")
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Connection error during restore")
        } finally {
            setIsRestoring(false)
        }
    }

    const restoreOverlayTitle = showRestoreConfirm?.type === "Database"
        ? "Restore database"
        : showRestoreConfirm?.type === "Storage Data"
            ? "Restore storage files"
            : showRestoreConfirm?.type === "User Details"
                ? "Restore user details (hybrid)"
                : "Restore backup"

    const restoreOverlayHint = showRestoreConfirm?.type === "Database"
        ? "This overwrites the live database via SQL restore."
        : showRestoreConfirm?.type === "Storage Data"
            ? "Files will be written into configured storage paths from the zip."
            : showRestoreConfirm?.type === "User Details"
                ? "Existing users update by email; new users are created; duplicate transactions are skipped."
                : "This will apply the selected backup."

    const backupList = Array.isArray(backups) ? backups : []

    return (
        <div className="flex-1 space-y-6 pb-10 relative">
            {isRestoring && (
                <div className="absolute inset-0 z-50 bg-[#0b1f1c]/60 backdrop-blur-sm rounded-xl flex items-center justify-center p-6">
                    <Card className="w-full max-w-md shadow-2xl border-[#0f5c52]/30">
                        <CardContent className="pt-8 pb-8 space-y-6 text-center">
                            <div className="h-16 w-16 rounded-full bg-[#0f5c52]/10 flex items-center justify-center mx-auto mb-4">
                                <RefreshCcw className="h-8 w-8 text-[#0f5c52] animate-spin" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-[#0b1f1c]">Restore in progress</h3>
                                <p className="text-sm text-[#5a736c]">Please wait — do not refresh the page.</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

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
                                {restoreOverlayTitle}: <span className="font-bold text-[#0b1f1c]">{showRestoreConfirm.name}</span>?
                                <br /><br />
                                <span className="text-amber-800/90 font-medium text-xs">{restoreOverlayHint}</span>
                            </p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" size="sm" onClick={() => setShowRestoreConfirm(null)}>Cancel</Button>
                                <Button className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none" size="sm" onClick={() => void startRestore()}>Yes, Restore</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#0b1f1c] sm:text-3xl">Update and Licence</h2>
                    <p className="mt-1 text-sm text-[#5a736c]">Manage license, maintenance, uploads, and backups.</p>
                </div>
            </div>

            {maintenanceMode && (
                <div className="w-full bg-amber-50/80 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex items-start gap-3 border border-amber-100/50">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-900">System Maintenance Mode Active</h4>
                        <p className="text-xs text-amber-700 mt-1">{maintenanceMessage}</p>
                    </div>
                </div>
            )}

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <ShieldCheck className="h-5 w-5 text-emerald-500" /> Licence Information
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">Manage your application license key.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="flex justify-between items-center p-4 rounded-xl bg-[#f0f4f2]/60 border border-[#0b1f1c]/8">
                        <div>
                            <p className="text-xs text-[#5a736c] uppercase font-bold tracking-wider mb-1">Subscription Status</p>
                            <p className="text-base font-bold text-emerald-600 flex items-center gap-1.5">
                                <CheckCircle className="h-4 w-4" /> {licenseInfo?.license_status || "Checking..."}
                            </p>
                        </div>
                        <Button size="sm" variant="outline" className="bg-white hover:bg-[#f0f4f2]/60" onClick={() => void fetchSystemStatus()}>
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
                                        className={cn("flex-1 font-mono uppercase", licenseForm.formState.errors.license_key && "border-red-400")}
                                        disabled={licenseForm.formState.isSubmitting}
                                    />
                                    <Button type="submit" disabled={licenseForm.formState.isSubmitting} className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none shrink-0">
                                        {licenseForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => { setIsEditingLicense(false); licenseForm.reset() }} disabled={licenseForm.formState.isSubmitting} className="bg-white shrink-0">
                                        Cancel
                                    </Button>
                                </div>
                                {licenseForm.formState.errors.license_key && (
                                    <p className="text-xs font-semibold text-red-500 flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {licenseForm.formState.errors.license_key.message}
                                    </p>
                                )}
                            </form>
                        ) : (
                            <div className="flex gap-2">
                                <div className="flex-1 px-4 py-2.5 rounded-lg border border-[#0b1f1c]/10 bg-[#f0f4f2]/60 font-mono text-sm text-[#0b1f1c] flex items-center shadow-inner">
                                    {licenseInfo?.license_key ? licenseInfo.license_key : "XXXX-XXXX-XXXX-XXXX"}
                                </div>
                                <Button size="icon" variant="outline" className="h-10 w-10 shrink-0 bg-white" onClick={() => { setIsEditingLicense(true); licenseForm.reset() }}>
                                    <Key className="h-4 w-4 text-[#0f5c52]" />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#6b857c] pt-1 uppercase font-bold tracking-widest border-t border-[#0b1f1c]/8">
                        <span>Author: {licenseInfo?.author || "—"}</span>
                        <span>Version: {licenseInfo?.version || "—"}</span>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Wrench className="h-5 w-5 text-amber-500" /> System Maintenance Control
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Block new user/API verification work while admins keep access.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-[#0b1f1c]/8 shadow-none shrink-0">
                        <div className="text-right">
                            <p className="text-xs font-semibold text-[#0b1f1c]">Maintenance Status</p>
                            <p className="text-[10px] text-[#5a736c]">
                                {maintenanceMode ? "New validations blocked" : "System fully operational"}
                            </p>
                        </div>
                        <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid gap-6 md:grid-cols-12 items-start">
                        <div className="md:col-span-7 space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-[#5a736c] uppercase tracking-wider">Notification Banner Message</Label>
                                <Textarea
                                    value={maintenanceMessage}
                                    onChange={(e) => setMaintenanceMessage(e.target.value.slice(0, 2000))}
                                    placeholder="Enter maintenance banner message for users..."
                                    className="min-h-[90px] resize-none text-xs focus-visible:ring-amber-500"
                                    disabled={!maintenanceMode}
                                />
                            </div>
                            <div className="rounded-lg bg-amber-50/50 border border-amber-100/50 p-3.5 text-xs text-amber-800 leading-relaxed">
                                <strong className="font-semibold">Graceful drain:</strong> Running bulk jobs continue; new uploads and API validations are blocked for non-admin users.
                            </div>
                        </div>
                        <div className="md:col-span-5 space-y-4 flex flex-col justify-between min-h-[175px]">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-[#5a736c] uppercase tracking-wider">Banner Preview</Label>
                                <div className={cn(
                                    "p-4 rounded-xl border text-xs min-h-[90px] flex items-center justify-center",
                                    maintenanceMode ? "bg-amber-50/80 border-amber-200 text-amber-900" : "bg-[#f0f4f2]/60 border-[#0b1f1c]/10 text-[#6b857c] italic"
                                )}>
                                    {maintenanceMode ? (
                                        <div className="flex gap-2 items-start">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="leading-relaxed">{maintenanceMessage}</p>
                                        </div>
                                    ) : "Toggle maintenance to preview"}
                                </div>
                            </div>
                            <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-none" size="sm" disabled={isSavingMaintenance} onClick={() => void handleSaveMaintenance()}>
                                {isSavingMaintenance ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : "Save Maintenance Settings"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <UploadCloud className="h-5 w-5 text-[#0f5c52]" /> Upload & Restore
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">
                        Upload backups (.sql / storage .zip / user .json) or a release zip with manifest.json. Restore is confirm-only for backups.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div
                        onDragOver={(e) => {
                            e.preventDefault()
                            if (!isUploadingBackup) setBackupUploadStatus("dragging")
                        }}
                        onDragLeave={() => setBackupUploadStatus("idle")}
                        onDrop={(e) => {
                            e.preventDefault()
                            setBackupUploadStatus("idle")
                            const files = e.dataTransfer.files
                            if (files?.length) void uploadBackupFile(files[0])
                        }}
                        onClick={() => !isUploadingBackup && backupFileInputRef.current?.click()}
                        className={cn(
                            "relative group cursor-pointer border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center text-center",
                            isUploadingBackup && "pointer-events-none opacity-70",
                            backupUploadStatus === "dragging"
                                ? "border-[#0f5c52] bg-[#0f5c52]/5 scale-[0.99]"
                                : "border-[#0b1f1c]/10 hover:border-[#0f5c52]/40 hover:bg-[#f0f4f2]/40"
                        )}
                    >
                        <input
                            type="file"
                            ref={backupFileInputRef}
                            onChange={(e) => e.target.files?.[0] && void uploadBackupFile(e.target.files[0])}
                            className="hidden"
                            accept=".sql,.zip,.json,application/json,application/zip"
                        />
                        <div className="h-12 w-12 rounded-full bg-[#0f5c52]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                            {isUploadingBackup
                                ? <Loader2 className="h-6 w-6 text-[#0f5c52] animate-spin" />
                                : <HardDriveDownload className="h-6 w-6 text-[#0f5c52]" />}
                        </div>
                        <h3 className="text-sm font-semibold text-[#0b1f1c] mb-1">
                            {isUploadingBackup ? "Uploading…" : "Drop file here"}
                        </h3>
                        <p className="text-xs text-[#5a736c]">
                            .sql (DB) · .zip (Storage or Release metadata) · .json (User Details)
                        </p>
                        <p className="text-[10px] text-[#6b857c] mt-4 uppercase font-bold tracking-tighter">
                            Backups: upload then Restore · Release zip: updates Version instantly
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                            <Database className="h-5 w-5 text-[#0f5c52]" /> System Backup & Recovery
                        </CardTitle>
                        <CardDescription className="text-[#5a736c]">Create backups, upload files, then restore with confirmation. SQL / Storage / Users supported.</CardDescription>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                        <Button onClick={() => void generateBackup("Storage Data")} disabled={isBackingUp} size="sm" className="border border-[#08352f] bg-[#0f5c52] hover:bg-[#0b4a42] text-white shadow-none">
                            {isBackingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <HardDriveDownload className="h-3.5 w-3.5 mr-2" />}
                            Storage Data
                        </Button>
                        <Button onClick={() => void generateBackup("Database")} disabled={isBackingUp} size="sm" variant="outline" className="bg-white">DB Only</Button>
                        <Button onClick={() => void generateBackup("User Details")} disabled={isBackingUp} size="sm" variant="outline" className="bg-white">User Details</Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6b857c] uppercase tracking-wider mb-2">
                            <History className="h-3.5 w-3.5" /> Backup History
                        </div>
                        <div className="grid gap-3">
                            {backupList.length === 0 ? (
                                <p className="text-sm text-[#6b857c] text-center py-6">No backups yet.</p>
                            ) : backupList.map((backup) => (
                                <div key={backup.name} className="flex items-center justify-between p-3 rounded-lg border border-[#0b1f1c]/8 bg-white hover:bg-[#f0f4f2]/40 transition-colors group">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-lg bg-[#f0f4f2]/60 flex items-center justify-center shrink-0">
                                            {backup.type === "Database" ? <Database className="h-4 w-4 text-[#6b857c]" /> : <FileArchive className="h-4 w-4 text-[#6b857c]" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-[#0b1f1c] truncate">{backup.name}</p>
                                                <span className="px-1.5 py-0.5 rounded-full bg-[#0b1f1c]/5 text-[9px] font-bold text-[#5a736c] uppercase">{backup.type}</span>
                                            </div>
                                            <p className="text-[10px] text-[#6b857c]">{backup.date} • {backup.size}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            title="Restore"
                                            className="h-8 w-8 text-[#6b857c] hover:text-[#0f5c52]"
                                            onClick={() => setShowRestoreConfirm({ id: backup.id, name: backup.name, type: backup.type })}
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" title="Download" className="h-8 w-8 text-[#6b857c] hover:text-[#0f5c52]" onClick={() => downloadBackup(backup.name)}>
                                            <Download className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" title="Delete" className="h-8 w-8 text-[#6b857c] hover:text-rose-500" onClick={() => void deleteBackup(backup.name)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-[#0b1f1c]/10 bg-white/90 shadow-none overflow-hidden">
                <CardHeader className="bg-[#f0f4f2]/60 border-b border-[#0b1f1c]/8">
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold text-[#0b1f1c]">
                        <History className="h-5 w-5 text-[#6b857c]" /> Current Release
                    </CardTitle>
                    <CardDescription className="text-[#5a736c]">From registered release metadata (not a full changelog history).</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-2">
                    <div className="relative border-l-2 border-[#0b1f1c]/8 ml-2 space-y-6 pb-2">
                        <div className="relative pl-6">
                            <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-[#0f5c52] border-2 border-white" />
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-bold text-[#0b1f1c] text-sm">{licenseInfo?.version || "—"}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#0f5c52] text-white tracking-wide">Current</span>
                                <span className="text-xs text-[#6b857c]">{licenseInfo?.release_date || "—"}</span>
                            </div>
                            <p className="text-sm text-[#5a736c]">
                                {licenseInfo?.release_notes?.trim() || "No release notes registered yet. Upload a release zip with manifest.json via Upload & Restore."}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
