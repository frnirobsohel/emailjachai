import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not defined.');
}
const secretKey = new TextEncoder().encode(JWT_SECRET);

export type AuthTokenPayload = {
    userId: number;
    role: string;
};

export async function authorizeUser(user: { id: number, role: string }, apiKey?: string) {
    const payload = {
        userId: user.id,
        role: user.role,
    };

    const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secretKey);

    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
    });

    if (apiKey) {
        cookieStore.set('user_api_key', apiKey, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        });
    }
}

export async function verifyUser(providedToken?: string): Promise<AuthTokenPayload | null> {
    let token = providedToken;

    if (!token) {
        try {
            const cookieStore = await cookies();
            token = cookieStore.get('auth_token')?.value;
        } catch {
            // Likely in middleware where next/headers is not available
            return null;
        }
    }

    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, secretKey);
        return payload as AuthTokenPayload;
    } catch {
        return null;
    }
}
