import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ouch-prod-var-cdn.icons8.com',
      },
    ],
  },
  serverExternalPackages: ['@napi-rs/canvas', 'pdf-parse'],
  transpilePackages: ['@repo/adapter-feishu'],
};

export default nextConfig;
