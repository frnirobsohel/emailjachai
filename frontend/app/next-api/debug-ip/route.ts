import { NextResponse } from 'next/server'
import { getClientIpDebug } from '@/lib/client-ip'

/**
 * Temporary Dokploy/Traefik IP diagnosis.
 * Enable with DEBUG_CLIENT_IP=1 on the frontend service, then open /next-api/debug-ip
 */
export async function GET(request: Request) {
    if (process.env.DEBUG_CLIENT_IP !== '1') {
        return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
        status: 'success',
        data: getClientIpDebug(request.headers),
        hint:
            'detected should be your public IP (e.g. 103.x). If it is empty or 172.17.0.1, enable Cloudflare orange-cloud proxy or fix Traefik real-IP / host networking.',
    })
}
