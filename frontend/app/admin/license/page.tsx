import { fetchServer } from "@/lib/fetch-server"
import { LicenseClient } from "./license-client"

export default async function LicensePage() {
    let initialLicenseInfo: any = null;
    let initialBackups: any[] = [];
    
    try {
        const [licenseRes, backupsRes] = await Promise.all([
            fetchServer('/admin/system/status'),
            fetchServer('/admin/system/backups')
        ]);

        if (licenseRes.status === 'success') {
            initialLicenseInfo = licenseRes.data;
        }

        if (backupsRes.status === 'success') {
            initialBackups = Array.isArray(backupsRes.data) ? backupsRes.data : [];
        }
    } catch (e) {
        console.error("Failed to fetch admin license/backup data:", e);
    }

    return <LicenseClient initialLicenseInfo={initialLicenseInfo} initialBackups={initialBackups} />
}
