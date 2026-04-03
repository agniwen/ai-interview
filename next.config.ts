import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ouch-prod-var-cdn.icons8.com',
      },
    ],
  },
  serverExternalPackages: ['@napi-rs/canvas', 'pdf-parse'],
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
