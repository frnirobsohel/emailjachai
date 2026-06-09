"use client"

import { useSocket } from "@/hooks/use-socket";
import { useEffect, useState } from "react";
import { useCreditStore } from "@/lib/store/credit-state";
import { logger } from "@/lib/logger";

export function AppShell({ children }: { children: React.ReactNode }) {
    const { isConnected } = useSocket();
    const { setBalance } = useCreditStore();

    useEffect(() => {
        // Handle credit updates globally via WebSocket
        const handleCreditUpdate = (event: any) => {
            const { data } = event.detail;
            if (data && typeof data.balance === 'number') {
                logger.info(`Credits updated: ${data.balance}`);
                setBalance(data.balance);
            }
        };

        window.addEventListener('ws:credit_update' as any, handleCreditUpdate);
        return () => window.removeEventListener('ws:credit_update' as any, handleCreditUpdate);
    }, [setBalance]);

    const [isAppRoute, setIsAppRoute] = useState(false);

    useEffect(() => {
        const path = window.location.pathname;
        setIsAppRoute(path.startsWith('/dashboard') || path.startsWith('/admin'));
    }, []);

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
