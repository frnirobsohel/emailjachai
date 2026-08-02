import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

export async function GET() {
    try {
        const payload = await verifyUser();
        const cookieStore = await cookies();

        if (!payload) {
            return NextResponse.json({ status: 'error', message: 'Not authenticated' }, { status: 401 });
        }

        const apiKey = cookieStore.get('user_api_key')?.value;

        if (!apiKey) {
            return NextResponse.json({ status: 'error', message: 'Unable to resolve API Key from session' }, { status: 500 });
        }

        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });

        const result = await response.json();

        if (result.status === 'error' || !response.ok) {
            return NextResponse.json(
                { status: 'error', message: result.message || 'Failed to fetch profile' },
                { status: response.status || 401 }
            );
        }

        const adminImpersonatorToken = cookieStore.get('admin_impersonator_token')?.value;

        // Go /auth/me returns { status: 'success', data: { id, name, email, role, credits, ... } }
        return NextResponse.json({
            status: 'success',
            data: {
                user: result.data,
                isImpersonating: !!adminImpersonatorToken
            }
        });

    } catch (error: unknown) {
        console.error('Me API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ status: 'error', message }, { status: 500 });
    }
}
