import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { cookies } from 'next/headers';
import { revalidateTag } from 'next/cache';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
// M2 Fix: packages/list added — backend serves it without auth (pricing page for guests)
const PUBLIC_PROXY_ROUTES = new Set([
  'settings/public',
  'auth/login',
  'auth/register',
  'auth/forgot-password',
  'auth/reset-password',
  'jobs/verify-public',
  'jobs/verify-public/status',
  'packages/list',        // Public pricing page — no auth needed
]);

/**
 * Proxy function to forward requests to the Go backend
 */
async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join('/');
    const isPublicRoute = PUBLIC_PROXY_ROUTES.has(slug);
    const user = isPublicRoute ? { userId: 0, role: 'public' } : await verifyUser();

    if (!isPublicRoute && !user) {
        console.error('Proxy Auth Failed: No valid user session found. Ensure you are logged in and cookies are preserved.');
        return NextResponse.json({ status: 'error', message: 'Unauthorized proxy access' }, { status: 401 });
    }

    const query = request.nextUrl.search;
    const url = `${API_BASE_URL}/${slug}${query}`;

    const whitelist = ['accept', 'content-type', 'user-agent', 'x-request-id', 'cookie'];
    const headers = new Headers();

    // Only forward whitelisted headers
    request.headers.forEach((value: string, key: string) => {
        if (whitelist.includes(key.toLowerCase())) {
            headers.set(key, value);
        }
    });

    // Forward the client's actual IP address to the backend
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    if (clientIp) {
        headers.set('X-Forwarded-For', clientIp);
    }

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

        // For multipart: explicitly preserve the original Content-Type with boundary
        if (isMultipart) {
            headers.set('Content-Type', contentTypeHeader);
        }

        const body = request.method !== 'GET' && request.method !== 'HEAD'
            ? (isMultipart ? request.body : await request.text())
            : undefined;

        const shouldCache = request.method === 'GET' && isPublicRoute && slug !== 'settings/public';

        const response = await fetch(url, {
            method: request.method,
            headers: headers,
            body: body,
            cache: shouldCache ? 'force-cache' : 'no-store',
            next: { revalidate: shouldCache ? 300 : 0 },
            ...(isMultipart ? { duplex: 'half' as const } : {}),
        } as RequestInit);

        if (slug === 'admin/settings/update' && response.ok) {
            try {
                revalidateTag('public-settings', { expire: 0 });
            } catch (err) {
                console.error("Failed to revalidate public-settings tag:", err);
            }
        }

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

            // Copy Set-Cookie headers for downloads
            if (typeof response.headers.getSetCookie === 'function') {
                response.headers.getSetCookie().forEach(cookie => {
                    passthroughHeaders.append('Set-Cookie', cookie);
                });
            }

            return new NextResponse(response.body, {
                status: response.status,
                headers: passthroughHeaders,
            });
        }

        // Forward the response carefully for non-download content
        const rawResponseData = await response.text();
        const responseData = rawResponseData.trim();

        // Build headers for the return response, forwarding Content-Type and Set-Cookies
        const nextResponseHeaders = new Headers();
        if (typeof response.headers.getSetCookie === 'function') {
            response.headers.getSetCookie().forEach(cookie => {
                nextResponseHeaders.append('Set-Cookie', cookie);
            });
        } else {
            const rawSetCookie = response.headers.get('set-cookie');
            if (rawSetCookie) {
                nextResponseHeaders.set('Set-Cookie', rawSetCookie);
            }
        }

        if (!responseData) {
             return NextResponse.json({ status: 'success', data: null }, { 
                 status: response.status,
                 headers: nextResponseHeaders
             });
        }

        // Try to parse as JSON, otherwise return as text
        try {
            const json = JSON.parse(responseData);
            nextResponseHeaders.set('Content-Type', 'application/json');
            return NextResponse.json(json, {
                status: response.status,
                headers: nextResponseHeaders
            });
        } catch {
            nextResponseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'text/plain');
            return new NextResponse(responseData, {
                status: response.status,
                headers: nextResponseHeaders
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
