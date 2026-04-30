import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const user = await verifyUser();
    if (!user) {
        return NextResponse.json({ status: 'error', message: 'Unauthorized proxy access' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const apiKey = cookieStore.get('user_api_key')?.value || null;

    if (!apiKey) {
        return NextResponse.json({ status: 'error', message: 'API Key not found in session' }, { status: 401 });
    }

    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }
    headers.set('Authorization', `Bearer ${apiKey}`);
    headers.set('X-Request-ID', request.headers.get('x-request-id') || `upload_${Date.now()}`);

    try {
        const response = await fetch(`${API_BASE_URL}/jobs/submit-file`, {
            method: 'POST',
            headers,
            body: request.body,
            cache: 'no-store',
            // Required by Node fetch when forwarding a request body stream.
            duplex: 'half',
        } as unknown as RequestInit);

        const payload = await response.text();
        try {
            const json = JSON.parse(payload);
            return NextResponse.json(json, { status: response.status });
        } catch {
            return NextResponse.json(
                { status: 'error', message: 'Invalid backend response' },
                { status: response.status || 500 }
            );
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown upload proxy error';
        return NextResponse.json(
            { status: 'error', message: 'Upload proxy failed', details: message },
            { status: 500 }
        );
    }
}
