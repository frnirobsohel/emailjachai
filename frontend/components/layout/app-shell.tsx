"use client"

import { useSocket, type WsMessage } from "@/hooks/use-socket";
import { useEffect } from "react";
import { useCreditStore } from "@/stores/credit-state";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useDashboardWebSocket } from "@/hooks/use-dashboard-web-socket";
import { logger } from "@/lib/logger";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // Default to false during SSR, then determine based on pathname
    const isAppRoute = pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || false;
    
    const { isConnected } = useSocket(isAppRoute);
    const { setBalance } = useCreditStore();

    // Call the dashboard WebSocket hook globally to ensure stats are updated in real-time
    useDashboardWebSocket();



    // Keep dashboard credits fresh on every app-route mount (covers hard reload)
    useEffect(() => {
        if (!isAppRoute || !pathname?.startsWith("/dashboard")) return
        void useDashboardStore.getState().fetchStats()
    }, [isAppRoute, pathname])

    useEffect(() => {
        // Handle credit updates globally via WebSocket (legacy/fallback)
        const handleCreditUpdate = (event: Event) => {
            const data = (event as CustomEvent<WsMessage>).detail.data as Record<string, unknown>;
            if (typeof data.balance === 'number') {
                logger.info(`Credits updated (legacy): ${data.balance}`);
                setBalance(data.balance);
                useCreditStore.getState().setLastFetched(Date.now());
            }
        };

        // Handle user update event sent by the Go backend (contains updated credits)
        const handleUserUpdate = (event: Event) => {
            const data = (event as CustomEvent<WsMessage>).detail.data as Record<string, unknown>;
            if (typeof data.credits === 'number') {
                logger.info(`User credits updated: ${data.credits}`);
                setBalance(data.credits);
                useCreditStore.getState().setLastFetched(Date.now());
                
                // Keep the dashboard stats in sync with the updated credit balance
                const dashboardStore = useDashboardStore.getState();
                if (dashboardStore.stats) {
                    dashboardStore.setStats({
                        ...dashboardStore.stats,
                        credits_remaining: data.credits.toLocaleString(),
                    });
                } else {
                    void dashboardStore.fetchStats(true);
                }
            }
        };

        window.addEventListener('ws:credit_update', handleCreditUpdate as EventListener);
        window.addEventListener('ws:user_update', handleUserUpdate as EventListener);

        return () => {
            window.removeEventListener('ws:credit_update', handleCreditUpdate as EventListener);
            window.removeEventListener('ws:user_update', handleUserUpdate as EventListener);
        };
    }, [setBalance]);

    return (
        <>
            {children}
            {/* Global WebSocket Connection Status (Optional for Debug) */}
            {process.env.NODE_ENV === 'development' && isAppRoute && (
                <div className={`fixed bottom-4 right-4 h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} shadow-sm`} title={isConnected ? 'Connected' : 'Disconnected'} />
            )}
        </>
    );
}

