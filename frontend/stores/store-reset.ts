import { useDashboardStore } from '@/stores/dashboard-store';
import { useJobsStore } from '@/stores/jobs-store';
import { useLogsStore } from '@/stores/logs-store';
import { useCreditStore } from '@/stores/credit-state';
import { useSecurityStore } from '@/stores/security-store';
import { useServerStore } from '@/stores/server-store';
import { useAdminStore } from '@/stores/admin-store';
import { useUsersStore } from '@/stores/users-store';
import { useConfigStore } from '@/stores/config-store';

/**
 * Resets all Zustand stores to their initial state.
 * Call this on logout to prevent data leakage between sessions.
 */
export function resetAllStores() {
    useDashboardStore.setState({
        stats: null,
        recentJobs: [],
        isLoadingStats: false,
        lastFetchedStats: null,
    });

    useJobsStore.setState({
        jobs: [],
        total: 0,
        currentJobDetails: null,
    });

    useLogsStore.setState({
        logs: [],
        total: 0,
        hasMore: true,
    });

    useCreditStore.setState({
        balance: 0,
        isLoading: false,
        lastFetched: null,
    });

    useSecurityStore.setState({
        logs: [],
        blocked: [],
        packages: [],
        stats: {
            total_verified: 0,
            unique_ips: 0,
            fraud_prevented: 0,
            currently_blocked: 0,
        },
        dailyLimit: '10',
        isVerificationEnabled: true,
        hasInitialized: false,
    });

    useServerStore.setState({
        servers: [],
    });

    useAdminStore.getState().reset();

    useUsersStore.getState().reset();

    useConfigStore.setState({
        packagesFetchedAt: 0,
        settingsFetchedAt: 0,
        packages: null,
        settings: null,
        isLoadingPackages: false,
        isLoadingSettings: false,
    });
}
