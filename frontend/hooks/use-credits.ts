import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useCreditStore } from '@/lib/store/credit-state'

export function useCredits() {
    const { balance, setBalance, isLoading, setLoading } = useCreditStore()

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await apiClient.get<{ credits: number }>('/user/credits')
            if (res.status === 'success' && res.data) {
                setBalance(res.data.credits)
            }
        } catch (err) {
            console.error('Failed to fetch credits', err)
        } finally {
            setLoading(false)
        }
    }, [setBalance, setLoading])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { credits: balance, loading: isLoading, refresh }
}
