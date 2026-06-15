"use server"

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1'

export async function verifyEmailPublic(email: string) {
    try {
        const apiKey = process.env.ADMIN_API_KEY
        
        // We make the request to the backend. We pass the admin API key for auth if needed.
        // Or if the backend relies on IP/Host, it's passed automatically.
        const res = await fetch(`${API_BASE_URL}/jobs/verify-single`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({ email }),
            // Prevent caching to ensure real-time verification
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
