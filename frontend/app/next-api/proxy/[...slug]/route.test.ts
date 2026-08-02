import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { NextRequest } from 'next/server';
import { verifyUser } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
    verifyUser: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: vi.fn((key: string) => {
            if (key === 'user_api_key') return { value: 'mock-api-key' };
            return null;
        })
    })),
}));

vi.mock('next/cache', () => ({
    revalidateTag: vi.fn(),
}));

describe('Proxy API Route', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        global.fetch = vi.fn();
    });

    it('rejects private route requests if no user session is found', async () => {
        vi.mocked(verifyUser).mockResolvedValue(null);

        const req = new NextRequest('http://localhost:3000/next-api/proxy/dashboard/summary');
        const params = Promise.resolve({ slug: ['dashboard', 'summary'] });

        const res = await GET(req, { params });
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.status).toBe('error');
        expect(data.message).toBe('Unauthorized proxy access');
    });

    it('allows public verify status GET, forwards IP/cookies, and never caches', async () => {
        vi.mocked(verifyUser).mockResolvedValue(null); // not logged in, but public route

        const mockResponse = new Response(JSON.stringify({ status: 'success', data: 'public-data' }), {
            status: 200,
            headers: new Headers({
                'content-type': 'application/json',
                'set-cookie': 'device_id=12345; Path=/'
            })
        });
        vi.mocked(global.fetch).mockResolvedValue(mockResponse);

        const req = new NextRequest('http://localhost:3000/next-api/proxy/jobs/verify-public/status', {
            method: 'GET',
            headers: {
                'x-forwarded-for': '203.0.113.195',
                'cookie': 'device_id=12345',
                'user-agent': 'Mozilla/5.0'
            }
        });
        const params = Promise.resolve({ slug: ['jobs', 'verify-public', 'status'] });

        const res = await GET(req, { params });
        expect(res.status).toBe(200);
        
        // Assert backend fetch was called correctly
        expect(global.fetch).toHaveBeenCalledOnce();
        const [fetchUrl, fetchOptions] = vi.mocked(global.fetch).mock.calls[0];
        expect(fetchUrl).toContain('/jobs/verify-public/status');
        
        const fetchHeaders = fetchOptions?.headers as Headers;
        expect(fetchHeaders.get('X-Forwarded-For')).toBe('203.0.113.195');
        expect(fetchHeaders.get('X-Real-IP')).toBe('203.0.113.195');
        expect(fetchHeaders.get('cookie')).toBe('device_id=12345');
        expect(fetchHeaders.get('user-agent')).toBe('Mozilla/5.0');
        // Personalized remaining quota must never be force-cached
        expect(fetchOptions?.cache).toBe('no-store');

        // Assert response headers returned to client contain Set-Cookie
        expect(res.headers.get('Set-Cookie')).toBe('device_id=12345; Path=/');
        
        const data = await res.json();
        expect(data.data).toBe('public-data');
    });

    it('caches public packages list GET', async () => {
        vi.mocked(verifyUser).mockResolvedValue(null);

        const mockResponse = new Response(JSON.stringify({ status: 'success', data: [] }), {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' })
        });
        vi.mocked(global.fetch).mockResolvedValue(mockResponse);

        const req = new NextRequest('http://localhost:3000/next-api/proxy/packages/list', {
            method: 'GET',
        });
        const params = Promise.resolve({ slug: ['packages', 'list'] });

        const res = await GET(req, { params });
        expect(res.status).toBe(200);

        const [, fetchOptions] = vi.mocked(global.fetch).mock.calls[0];
        expect(fetchOptions?.cache).toBe('force-cache');
    });

    it('does NOT cache public POST requests', async () => {
        vi.mocked(verifyUser).mockResolvedValue(null);

        const mockResponse = new Response(JSON.stringify({ status: 'success', data: 'post-result' }), {
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' })
        });
        vi.mocked(global.fetch).mockResolvedValue(mockResponse);

        const req = new NextRequest('http://localhost:3000/next-api/proxy/jobs/verify-public', {
            method: 'POST',
            body: JSON.stringify({ email: 'test@example.com' }),
            headers: {
                'content-type': 'application/json',
                'x-forwarded-for': '198.51.100.1'
            }
        });
        const params = Promise.resolve({ slug: ['jobs', 'verify-public'] });

        const res = await POST(req, { params });
        expect(res.status).toBe(200);

        expect(global.fetch).toHaveBeenCalledOnce();
        const [, fetchOptions] = vi.mocked(global.fetch).mock.calls[0];
        expect(fetchOptions?.method).toBe('POST');
        expect(fetchOptions?.cache).toBe('no-store'); // mutating POST is never cached!
        
        const data = await res.json();
        expect(data.data).toBe('post-result');
    });
});
