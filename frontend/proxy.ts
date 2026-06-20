import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyUser } from '@/lib/auth'

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    const token = request.cookies.get('auth_token')?.value
    const user = token ? await verifyUser(token) : null

    // Protect /admin routes — must be logged in AND have 'admin' role
    if (pathname.startsWith('/admin')) {
        if (!user) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        if (user.role !== 'admin') {
            // Logged in but not admin
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    }

    // Protect /dashboard routes — must be logged in
    if (pathname.startsWith('/dashboard')) {
        if (!user) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    // Redirect authenticated users away from auth pages
    if (user && (pathname === '/login' || pathname === '/register')) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/register'],
}
