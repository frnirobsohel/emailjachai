/**
 * Legacy path — /admin/security redirects to /admin/public-verifier.
 * Keep a single implementation to avoid UI drift (L1).
 */
export { SecurityDashboardClient } from '@/app/admin/public-verifier/_components/security-dashboard-client'
