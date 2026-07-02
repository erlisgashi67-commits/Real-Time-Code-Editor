import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Production builds MUST fail on TypeScript errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Production builds MUST fail on lint errors.
    ignoreDuringBuilds: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
