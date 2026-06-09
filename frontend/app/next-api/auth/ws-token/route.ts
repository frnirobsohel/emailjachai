import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { verifyUser } from '@/lib/auth';

const JWT_SECRET = process.env.JWT_SECRET;
const secretKey = new TextEncoder().encode(JWT_SECRET || '');

/**
 * Returns a short-lived JWT token for WebSocket authentication.
 * The main auth uses httpOnly cookies which can't be read by client JS,
 * so this endpoint creates a separate token specifically for WS connections.
 */
export async function GET() {
    const user = await verifyUser();
    if (!user) {
        return NextResponse.json(
            { status: 'error', message: 'Unauthorized' },
            { status: 401 }
        );
    }

    // Create a short-lived token (5 minutes) specifically for WebSocket auth
    const wsToken = await new SignJWT({
        userID: user.userId,
        role: user.role,
        purpose: 'websocket',
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(secretKey);

    return NextResponse.json({
        status: 'success',
        data: { token: wsToken },
    });
}
