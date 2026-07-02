import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Production builds MUST fail on TypeScript errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
