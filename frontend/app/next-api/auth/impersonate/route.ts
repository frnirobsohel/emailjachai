import { NextResponse } from 'next/server';
import { authorizeUser, verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';

const PHP_API_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function POST(request: Request) {
    try {
        const adminAuth = await verifyUser();
        const cookieStore = await cookies();

        if (!adminAuth || adminAuth.role !== 'admin') {
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized. Admin privileges required.' },
                { status: 403 }
            );
        }

        const { user_id } = await request.json();

        if (!user_id) {
            return NextResponse.json(
                { status: 'error', message: 'Target user ID is required' },
                { status: 400 }
            );
        }

        // To call PHP Admin routes, we need the Admin's API key from the session
        const adminApiKey = cookieStore.get('user_api_key')?.value;

        if (!adminApiKey) {
            return NextResponse.json(
                { status: 'error', message: 'Unable to resolve admin API key from session' },
                { status: 500 }
            );
        }

        // Call PHP Backend to validate target user and log the action
        const response = await fetch(`${PHP_API_URL}/admin/impersonate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id }),
            cache: 'no-store'
        });

        const result = await response.json();

        if (result.status === 'error' || !response.ok) {
            return NextResponse.json(
                { status: 'error', message: result.message || 'Impersonation failed' },
                { status: response.status || 500 }
            );
        }

        const targetUser = result.data.user;
        const targetApiKey = result.data.api_key;

        // Store the original admin token in a new cookie
        const originalAdminToken = cookieStore.get('auth_token')?.value;
        const existingImpersonatorToken = cookieStore.get('admin_impersonator_token')?.value;
        const existingImpersonatorApiKey = cookieStore.get('admin_impersonator_api_key')?.value;

        // Overwrite the session cookie with the target user's details
        await authorizeUser({
            id: targetUser.id,
            role: targetUser.role || 'user'
        });

        // Overwrite the user_api_key cookie with the target user's key
        cookieStore.set('user_api_key', targetApiKey, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        });

        // Preserve the original admin token for "stop impersonating" functionality.
        if (originalAdminToken && !existingImpersonatorToken) {
            cookieStore.set('admin_impersonator_token', originalAdminToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
            });
        }

        // Preserve the original admin API key for restoring after impersonation.
        if (adminApiKey && !existingImpersonatorApiKey) {
            cookieStore.set('admin_impersonator_api_key', adminApiKey, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7,
                path: '/',
            });
        }

        return NextResponse.json({
            status: 'success',
            message: `Successfully logged in as ${targetUser.name}`,
        });

    } catch (error: unknown) {
        console.error('Impersonation Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
