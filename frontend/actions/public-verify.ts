"use server"

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export async function verifyEmailPublic(email: string) {
    try {
        // Uses the dedicated public endpoint — no API key required.
        // Rate limited server-side (5 req/min per IP) by the backend.
        const res = await fetch(`${API_BASE_URL}/jobs/verify-public`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
            cache: 'no-store'
        })

        const data = await res.json()
        return data
    } catch (error: any) {
        return {
            status: 'error',
            message: error.message || 'Verification failed. Please try again.'
        }
    }
}
