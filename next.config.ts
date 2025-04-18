import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    turbo: {},
  },
  images: {
    domains: ['warpcast.com', 'imagedelivery.net', 'i.imgur.com'],
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination: "/api/well-known/farcaster",
      },
    ];
  },
};

export default nextConfig;
