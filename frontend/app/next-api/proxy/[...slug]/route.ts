import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost/fontendapi/api';
const PUBLIC_PROXY_ROUTES = new Set(['settings/public']);

/**
 * Proxy function to forward requests to the PHP backend
 */
async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join('/');
    const isPublicRoute = PUBLIC_PROXY_ROUTES.has(slug);
    const user = await verifyUser();

    if (!isPublicRoute && !user) {
        console.error('Proxy Auth Failed: No valid user session found. Ensure you are logged in and cookies are preserved.');
        return NextResponse.json({ status: 'error', message: 'Unauthorized proxy access' }, { status: 401 });
    }

    const query = request.nextUrl.search;
    const url = `${API_BASE_URL}/${slug}${query}`;

    const whitelist = ['accept', 'content-type', 'user-agent', 'x-request-id'];
    const headers = new Headers();

    // Only forward whitelisted headers
    request.headers.forEach((value, key) => {
        if (whitelist.includes(key.toLowerCase())) {
            headers.set(key, value);
        }
    });

    let apiKey: string | null = null;
    if (!isPublicRoute) {
        const cookieStore = await cookies();
        apiKey = cookieStore.get('user_api_key')?.value || null;

        if (!apiKey) {
            return NextResponse.json({ status: 'error', message: 'API Key not found in session' }, { status: 401 });
        }
    }

    // Inject API key for authenticated routes only.
    if (apiKey) {
        headers.set('Authorization', `Bearer ${apiKey}`);
    }
    // Ensure X-Request-ID is set
    if (!headers.has('X-Request-ID')) {
        headers.set('X-Request-ID', `proxy_${Date.now()}`);
    }

    try {
        const contentTypeHeader = request.headers.get('content-type') || '';
        const isMultipart = contentTypeHeader.toLowerCase().includes('multipart/form-data');

        const body = request.method !== 'GET' && request.method !== 'HEAD'
            ? (isMultipart ? request.body : await request.text())
            : undefined;

        const response = await fetch(url, {
            method: request.method,
            headers: headers,
            body: body,
            cache: isPublicRoute ? 'force-cache' : 'no-store',
            next: { revalidate: isPublicRoute ? 300 : 0 },
            ...(isMultipart ? { duplex: 'half' as const } : {}),
        });

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        const contentDisposition = response.headers.get('content-disposition') || '';
        const isAttachment = /attachment/i.test(contentDisposition);
        const isDownloadPayload =
            isAttachment ||
            contentType.includes('text/csv') ||
            contentType.includes('application/x-ndjson');

        if (isDownloadPayload) {
            const passthroughHeaders = new Headers();
            const headerAllowList = [
                'content-type',
                'content-disposition',
                'cache-control',
                'pragma',
                'expires',
                'content-length'
            ];

            for (const headerName of headerAllowList) {
                const value = response.headers.get(headerName);
                if (value) {
                    passthroughHeaders.set(headerName, value);
                }
            }

            return new NextResponse(response.body, {
                status: response.status,
                headers: passthroughHeaders,
            });
        }

        // Forward the response carefully for non-download content
        const responseData = await response.text();

        // Try to parse as JSON, otherwise return as text
        try {
            const json = JSON.parse(responseData);
            return NextResponse.json(json, {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                }
            });
        } catch {
            return new NextResponse(responseData, {
                status: response.status,
                headers: {
                    'Content-Type': response.headers.get('Content-Type') || 'text/plain',
                }
            });
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown proxy error';
        console.error('Proxy Error:', error);
        return NextResponse.json({
            status: 'error',
            message: 'Internal Proxy Error',
            details: message
        }, { status: 500 });
    }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
