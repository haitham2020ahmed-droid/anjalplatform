import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  output: "standalone",

  serverExternalPackages: ["playwright-core"],

  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },

  async headers() {
    return [];
  },
};

export default nextConfig;
