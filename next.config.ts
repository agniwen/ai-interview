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
};

export default nextConfig;
