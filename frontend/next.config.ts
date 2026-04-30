import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const csp = isProd
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws://* wss://*; frame-ancestors 'self'; base-uri 'self'; form-action 'self';"
  : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://*;";

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
  // Optimize heavy packages so Turbopack doesn't re-analyze them on every compile
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],
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

