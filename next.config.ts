import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  serverExternalPackages: ['firebase-admin', '@google/generative-ai'],
};

export default nextConfig;

