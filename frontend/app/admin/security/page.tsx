import { SecurityDashboardClient } from "./_components/security-dashboard-client"

export const metadata = {
    title: 'Security Shield | Admin Dashboard',
    description: 'Manage public verifier security, fraud detection, and packages',
}

export default function SecurityShieldPage() {
    return (
        <div className="p-6">
            <SecurityDashboardClient />
        </div>
    )
}
