import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Permit development requests from Arena's proxied preview hosts.
  allowedDevOrigins: ['*.e2b.app'],
  poweredByHeader: false,
};

export default nextConfig;
