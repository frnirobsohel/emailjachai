import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const csp = isProd
  ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' wss: https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
  : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss: https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com;";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: csp
  }
];

if (isProd) {
  securityHeaders.unshift({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Optimize heavy packages so Turbopack doesn't re-analyze them on every compile
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-dropdown-menu'],
    // Soft-nav speed: keep visited RSC in client Router Cache (same as pre-stale-fix UX).
    // Freshness comes from mount/focus client refetch + optimistic updates — not from disabling this.
    staleTimes: {
      dynamic: 30,
      static: 5 * 60,
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

