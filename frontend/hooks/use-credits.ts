import { useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useCreditStore } from '@/stores/credit-state'

// ৩ মিনিটের মধ্যে fetch হলে পুনরায় API call করবে না
const CREDITS_CACHE_TTL = 3 * 60 * 1000;

export function useCredits() {
    const { balance, setBalance, isLoading, setLoading, lastFetched, setLastFetched } = useCreditStore()

    const refresh = useCallback(async (force = false) => {
        // Cache hit: তাজা ডেটা থাকলে skip
        if (!force && lastFetched && Date.now() - lastFetched < CREDITS_CACHE_TTL) {
            return;
        }
        if (isLoading) return;

        setLoading(true)
        try {
            const res = await apiClient.get<{ credits: number }>('/user/credits')
            if (res.status === 'success' && res.data) {
                setBalance(res.data.credits)
                setLastFetched(Date.now())
            }
        } catch (err) {
            console.error('Failed to fetch credits', err)
        } finally {
            setLoading(false)
        }
    }, [setBalance, setLoading, setLastFetched, lastFetched, isLoading])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { credits: balance, loading: isLoading, refresh }
}
