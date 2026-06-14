export const dynamic = 'force-dynamic';
import { fetchServer } from "@/lib/fetch-server"
import { LicenseClient, LicenseInfo, BackupFile } from "./license-client"

export default async function LicensePage() {
    let initialLicenseInfo: LicenseInfo | null = null;
    let initialBackups: BackupFile[] = [];
    
    try {
        const [licenseRes, backupsRes] = await Promise.all([
            fetchServer('/admin/system/status'),
            fetchServer('/admin/system/backups')
        ]);

        if (licenseRes.status === 'success') {
            initialLicenseInfo = licenseRes.data as LicenseInfo;
        }

        if (backupsRes.status === 'success') {
            initialBackups = Array.isArray(backupsRes.data) ? backupsRes.data as BackupFile[] : [];
        }
    } catch (e) {
        console.error("Failed to fetch admin license/backup data:", e);
    }

    return <LicenseClient initialLicenseInfo={initialLicenseInfo} initialBackups={initialBackups} />
}
