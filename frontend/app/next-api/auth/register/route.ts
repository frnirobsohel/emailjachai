import { NextResponse } from 'next/server';
import { applyClientIpHeaders } from '@/lib/client-ip';

const PHP_API_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { firstName, lastName, email, password } = body;

        if (!firstName || !lastName || !email || !password) {
            return NextResponse.json(
                { status: 'error', message: 'All fields are required' },
                { status: 400 }
            );
        }

        const headers = new Headers({ 'Content-Type': 'application/json' });
        applyClientIpHeaders(headers, request.headers);

        const response = await fetch(`${PHP_API_URL}/auth/register`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ firstName, lastName, email, password }),
            cache: 'no-store'
        });

        const result = await response.json();

        if (result.status === 'error' || !response.ok) {
            return NextResponse.json(
                { status: 'error', message: result.message || 'Registration failed' },
                { status: response.status || 500 }
            );
        }

        // result.data contains { user_id, api_key }
        return NextResponse.json(
            { status: 'success', message: 'User registered successfully', data: { userId: result.data.user_id } },
            { status: 201 }
        );

    } catch (error: unknown) {
        console.error('Registration Error:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
