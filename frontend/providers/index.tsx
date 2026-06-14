"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // ৫ মিনিট পর্যন্ত ডেটা "fresh" থাকবে → পেজ চেঞ্জ করলে re-fetch হবে না
                staleTime: 5 * 60 * 1000,
                // ১০ মিনিট পর্যন্ত cache মেমরিতে থাকবে (inactive queries)
                gcTime: 10 * 60 * 1000,
                // শুধু network error-এ retry করবে, 4xx-এ না
                retry: (failureCount, error: any) => {
                    if (error?.status >= 400 && error?.status < 500) return false;
                    return failureCount < 1;
                },
                // Window focus-এ auto re-fetch বন্ধ (tab switch করলে বারবার fetch হবে না)
                refetchOnWindowFocus: false,
            },
        },
    }));

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
