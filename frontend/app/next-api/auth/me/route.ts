import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';

const PHP_API_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost/fontendapi/api';

export async function GET() {
    try {
        const payload = await verifyUser();
        const cookieStore = await cookies();

        if (!payload) {
            return NextResponse.json({ status: 'error', message: 'Not authenticated' }, { status: 401 });
        }

        // To call the PHP /auth/me, we need the user's API key from the session
        const apiKey = cookieStore.get('user_api_key')?.value;

        if (!apiKey) {
            return NextResponse.json({ status: 'error', message: 'Unable to resolve API Key from session' }, { status: 500 });
        }

        // Call PHP Backend
        const response = await fetch(`${PHP_API_URL}/auth/me`, {
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

        // The PHP API returns { status: 'success', data: { id, name, email, role, credits } }
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
