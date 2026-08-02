/**
 * Resolve the originating client IP from reverse-proxy / CDN headers.
 * Prefers CDN-specific headers, then public hops from X-Forwarded-For / X-Real-IP.
 * Skips Docker/private addresses (e.g. 172.17.0.1) when a public IP is available.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
    const candidates = [
        headers.get('cf-connecting-ip'),
        headers.get('true-client-ip'),
        ...forwardedIps(headers.get('x-forwarded-for')),
        headers.get('x-real-ip'),
    ];

    let fallback = '';
    for (const raw of candidates) {
        const ip = normalizeIp(raw);
        if (!ip) continue;
        if (!isPrivateOrReservedIp(ip)) return ip;
        if (!fallback) fallback = ip;
    }

    return fallback;
}

/** Attach client IP headers for backend Gin ClientIP() behind Docker/Dokploy proxies. */
export function applyClientIpHeaders(
    target: Headers,
    source: { get(name: string): string | null },
): void {
    const ip = getClientIp(source);
    if (!ip || isPrivateOrReservedIp(ip)) return;
    target.set('X-Forwarded-For', ip);
    target.set('X-Real-IP', ip);
}

function forwardedIps(xff: string | null): string[] {
    if (!xff) return [];
    return xff.split(',').map((part) => part.trim()).filter(Boolean);
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

/** RFC1918 / loopback / link-local / Docker-ish ranges that are never a public client IP. */
export function isPrivateOrReservedIp(ip: string): boolean {
    const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0 || a === 100 && b >= 64 && b <= 127) return true; // 0.x / CGNAT 100.64/10
        return false;
    }

    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('fe80:')) return true; // link-local
    return false;
}
