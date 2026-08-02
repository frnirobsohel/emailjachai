/**
 * Resolve the originating client IP from reverse-proxy / CDN headers.
 * Prefers CDN-specific headers, then X-Real-IP, then the left-most X-Forwarded-For hop.
 */
export function getClientIp(headers: Headers): string {
    const candidates = [
        headers.get('cf-connecting-ip'),
        headers.get('true-client-ip'),
        headers.get('x-real-ip'),
        firstForwardedIp(headers.get('x-forwarded-for')),
    ];

    for (const raw of candidates) {
        const ip = normalizeIp(raw);
        if (ip) return ip;
    }

    return '';
}

/** Attach client IP headers for backend Gin ClientIP() behind Docker/Dokploy proxies. */
export function applyClientIpHeaders(target: Headers, source: Headers): void {
    const ip = getClientIp(source);
    if (!ip) return;
    target.set('X-Forwarded-For', ip);
    target.set('X-Real-IP', ip);
}

function firstForwardedIp(xff: string | null): string | null {
    if (!xff) return null;
    const first = xff.split(',')[0]?.trim();
    return first || null;
}

function normalizeIp(value: string | null | undefined): string {
    if (!value) return '';
    let ip = value.trim();
    if (!ip) return '';

    // Strip surrounding brackets from IPv6 literals: [2001:db8::1]
    if (ip.startsWith('[') && ip.includes(']')) {
        ip = ip.slice(1, ip.indexOf(']'));
    }

    // Strip :port from IPv4 host:port (avoid breaking IPv6)
    if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
        ip = ip.replace(/:\d+$/, '');
    }

    return ip;
}
