import { NextResponse } from 'next/server';
import { authorizeUser } from '@/lib/auth';
import { applyClientIpHeaders } from '@/lib/client-ip';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { status: 'error', message: 'Email and password are required' },
                { status: 400 }
            );
        }

        const headers = new Headers({ 'Content-Type': 'application/json' });
        applyClientIpHeaders(headers, request.headers);

        // Call Go Backend for authentication
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, password }),
            cache: 'no-store'
        });

        const result = await response.json();

        if (result.status === 'error' || !response.ok) {
            return NextResponse.json(
                { status: 'error', message: result.message || 'Invalid credentials' },
                { status: response.status || 401 }
            );
        }

        // Go AuthResponse: { api_key, user: { id, name, email, role, credits } }
        const { user, api_key } = result.data;

        // Set the JWT cookie and API Key cookie
        await authorizeUser({
            id: user.id,
            role: user.role || 'user'
        }, api_key);

        // Return the same success response as before to maintain frontend compatibility
        return NextResponse.json({
            status: 'success',
            message: 'Login successful',
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role || 'user'
            }
        }, { status: 200 });

    } catch (error: unknown) {
        console.error('Login Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
