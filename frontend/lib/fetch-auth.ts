/**
 * Global fetch wrapper that automatically adds API Key from localStorage
 * and handles 401 Unauthorized responses by logging out the user.
 */
/**
 * Global fetch wrapper for the proxy.
 * Note: Cookies (like auth_token) are automatically handled by the browser 
 * for same-origin requests to /next-api/proxy.
 */
export async function fetchAuth(url: string, options: RequestInit = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    } as Record<string, string>;

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 && typeof window !== 'undefined') {
            console.warn('Unauthorized request detected. Clearing session and redirecting to login...');
            // Explicitly call logout to clear httpOnly cookies and break redirect loops
            fetch('/next-api/auth/logout', { method: 'POST' }).finally(() => {
                window.location.href = '/login';
            });
            return response;
        }

        return response;
    } catch (error) {
        console.error('fetchAuth error:', error);
        throw error;
    }
}
