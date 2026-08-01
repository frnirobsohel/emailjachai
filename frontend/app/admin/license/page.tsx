import { Metadata } from "next"

export const metadata: Metadata = {
    title: "License Management",
}

import { fetchServer } from "@/lib/fetch-server"
import { LicenseClient, type LicenseInfo, type BackupFile } from "./license-client"

type SettingRow = { setting_key: string; setting_value: string }

export default async function LicensePage() {
    let initialLicenseInfo: LicenseInfo | null = null
    let initialBackups: BackupFile[] = []
    let maintenanceMode = false
    let maintenanceMessage =
        "We are currently optimizing our verification engine. Single/Bulk verification is temporarily paused. Your existing files are safe."

    try {
        const [licenseRes, backupsRes, settingsRes] = await Promise.all([
            fetchServer<LicenseInfo>("/admin/system/status"),
            fetchServer<BackupFile[]>("/admin/system/backups"),
            fetchServer<SettingRow[]>("/admin/settings"),
        ])

        if (licenseRes.status === "success" && licenseRes.data) {
            initialLicenseInfo = licenseRes.data
        }
        if (backupsRes.status === "success" && Array.isArray(backupsRes.data)) {
            initialBackups = backupsRes.data
        }
        if (settingsRes.status === "success" && Array.isArray(settingsRes.data)) {
            const mode = settingsRes.data.find(s => s.setting_key === "maintenance_mode")
            const msg = settingsRes.data.find(s => s.setting_key === "maintenance_message")
            if (mode) {
                maintenanceMode = mode.setting_value === "1" || mode.setting_value === "true"
            }
            if (msg?.setting_value) {
                maintenanceMessage = msg.setting_value
            }
        }
    } catch (e) {
        console.error("Failed to fetch admin license/backup data:", e)
    }

    return (
        <LicenseClient
            initialLicenseInfo={initialLicenseInfo}
            initialBackups={initialBackups}
            initialMaintenanceMode={maintenanceMode}
            initialMaintenanceMessage={maintenanceMessage}
        />
    )
}
