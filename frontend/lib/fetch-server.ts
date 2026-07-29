import { cookies } from 'next/headers';
import type { ApiResponse } from '@/types';
import { TZ_COOKIE } from '@/lib/timezone';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

function withServerTimeZone(endpoint: string, tz: string | undefined): string {
    if (!tz || endpoint.includes('tz=')) return endpoint;
    let decoded = tz;
    try {
        decoded = decodeURIComponent(tz);
    } catch {
        decoded = tz;
    }
    if (!decoded) return endpoint;
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${sep}tz=${encodeURIComponent(decoded)}`;
}

export async function fetchServer<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const cookieStore = await cookies();
    const apiKey = cookieStore.get('user_api_key')?.value;
    const tzCookie = cookieStore.get(TZ_COOKIE)?.value;
    
    if (!apiKey) {
        return { status: 'error', message: 'No API Key found in session' };
    }

    const urlPath = endpoint.startsWith('/dashboard/stats')
        ? withServerTimeZone(endpoint, tzCookie)
        : endpoint;

    try {
        const res = await fetch(`${API_BASE_URL}${urlPath}`, {
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
        return json as ApiResponse<T>;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[fetchServer] Error fetching ${endpoint}:`, msg);
        return { status: 'error', message: 'Failed to connect to backend server or parse JSON' };
    }
}

