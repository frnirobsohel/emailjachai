import { cookies } from 'next/headers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

export async function fetchServer<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const cookieStore = await cookies();
    const apiKey = cookieStore.get('user_api_key')?.value;
    
    if (!apiKey) {
        return { status: 'error', message: 'No API Key found in session' } as any;
    }

    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            // We use Next.js native fetch caching here if needed, 
            // but for user-specific dynamic dashboard data, we default to no-store.
            cache: 'no-store'
        });

        const json = await res.json();
        return json as T;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[fetchServer] Error fetching ${endpoint}:`, msg);
        return { status: 'error', message: 'Failed to connect to backend server or parse JSON' } as any;
    }
}

