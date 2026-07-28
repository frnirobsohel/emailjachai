import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    const adminImpersonatorToken = cookieStore.get('admin_impersonator_token')?.value;
    const adminImpersonatorApiKey = cookieStore.get('admin_impersonator_api_key')?.value;
    const isProd = process.env.NODE_ENV === 'production';

    const clearOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax' as const,
        expires: new Date(0),
        path: '/',
    };

    if (adminImpersonatorToken) {
        const response = NextResponse.json(
            { message: 'Returned to Admin', returnedToAdmin: true },
            { status: 200 }
        );

        // Restore the original admin token
        response.cookies.set('auth_token', adminImpersonatorToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
        });
        // Restore admin API key if available; otherwise clear it to avoid keeping impersonated key.
        if (adminImpersonatorApiKey) {
            response.cookies.set('user_api_key', adminImpersonatorApiKey, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 7, // 7 days
                path: '/',
            });
        } else {
            response.cookies.set('user_api_key', '', clearOptions);
        }

        // Clear the impersonator status token
        response.cookies.set('admin_impersonator_token', '', clearOptions);
        response.cookies.set('admin_impersonator_api_key', '', clearOptions);
        return response;
    }

    const response = NextResponse.json(
        { message: 'Logout successful' },
        { status: 200 }
    );

    // Normal logout: Clear both auth cookies
    response.cookies.set('auth_token', '', clearOptions);
    response.cookies.set('user_role', '', clearOptions);
    response.cookies.set('user_api_key', '', clearOptions);
    response.cookies.set('admin_impersonator_token', '', clearOptions);
    response.cookies.set('admin_impersonator_api_key', '', clearOptions);

    return response;
}
