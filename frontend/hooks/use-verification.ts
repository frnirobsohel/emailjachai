import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export function useVerification() {
    const [isVerifying, setIsVerifying] = useState(false);
    const [progress, setProgress] = useState(0);

    const startVerification = useCallback(async (email: string) => {
        setIsVerifying(true);
        setProgress(0);
        try {
            return await apiClient.post('/verify/single', { email });
        } catch (err) {
            console.error('Verification error', err);
            throw err;
        } finally {
            setIsVerifying(false);
        }
    }, []);

    return {
        isVerifying,
        progress,
        startVerification,
        setProgress
    };
}
