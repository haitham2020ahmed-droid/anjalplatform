import type { NextConfig } from "next";
import { securityHeaders } from "./src/server/auth/http";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Phase 13: self-contained server for the Docker image (.next/standalone)
  output: "standalone",
  // PDF engine: loaded at runtime from node_modules, never bundled
  serverExternalPackages: ["playwright-core"],
  // Phase 11: logo (≤ 1 MB) and roster files (≤ 3,000 rows) are sent through server actions
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;
