import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';
import { applyClientIpHeaders } from '@/lib/client-ip';

const PHP_API_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function POST(request: Request) {
    try {
        const payload = await verifyUser();
        const cookieStore = await cookies();

        if (!payload) {
            return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = cookieStore.get('user_api_key')?.value;
        if (!apiKey) {
            return NextResponse.json({ status: 'error', message: 'API Key missing from session' }, { status: 401 });
        }

        const body = await request.json();

        const headers = new Headers({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        });
        applyClientIpHeaders(headers, request.headers);

        // Forward request to PHP Backend
        const response = await fetch(`${PHP_API_URL}/auth/profile/update`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            cache: 'no-store'
        });

        const result = await response.json();

        if (result.status === 'error' || !response.ok) {
            return NextResponse.json(
                { status: 'error', message: result.message || 'Failed to update profile' },
                { status: response.status || 500 }
            );
        }

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error('Profile Update API Proxy Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
