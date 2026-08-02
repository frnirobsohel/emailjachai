"use server"

import { headers } from 'next/headers'
import { applyClientIpHeaders } from '@/lib/client-ip'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export async function verifyEmailPublic(email: string) {
    try {
        // Forward real client IP so backend Gin ClientIP() / fraud guard see the user, not Docker.
        const outgoing = new Headers({ 'Content-Type': 'application/json' })
        applyClientIpHeaders(outgoing, await headers())

        const res = await fetch(`${API_BASE_URL}/jobs/verify-public`, {
            method: 'POST',
            headers: outgoing,
            body: JSON.stringify({ email }),
            cache: 'no-store',
        })

        const data = await res.json()
        return data
    } catch (error: unknown) {
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Verification failed. Please try again.'
        }
    }
}
