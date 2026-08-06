import { NextResponse } from 'next/server'
import { getClientIpDebug } from '@/lib/client-ip'

/**
 * Temporary Dokploy/Traefik IP diagnosis (non-production only).
 * Enable with DEBUG_CLIENT_IP=1, then open /next-api/debug-ip.
 * Hard-disabled when NODE_ENV=production even if the flag is set.
 */
export async function GET(request: Request) {
    if (process.env.NODE_ENV === 'production' || process.env.DEBUG_CLIENT_IP !== '1') {
        return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
        status: 'success',
        data: getClientIpDebug(request.headers),
        hint:
            'detected should be your public IP (e.g. 103.x). If it is empty or 172.17.0.1, enable Cloudflare orange-cloud proxy or fix Traefik real-IP / host networking.',
    })
}
