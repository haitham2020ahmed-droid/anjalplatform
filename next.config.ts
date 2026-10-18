import type { NextConfig } from "next";
import { securityHeaders } from "./src/server/auth/http";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Phase 13: self-contained server for the Docker image (.next/standalone)
  output: "standalone",
  // PDF engine: loaded at runtime from node_modules, never bundled
  serverExternalPackages: ["playwright-core", "pdfjs-dist"],
  // Phase 11: logo (≤ 1 MB) and roster files (≤ 3,000 rows) are sent through server actions
  // r71: Render Starter is 512 MB — don't preload every route's server modules at boot; load each on first request instead
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    preloadEntriesOnStart: false,
  },
  // gzip for pages, data and scripts (Next's default, kept on explicitly: Render does not compress for the app)
  compress: true,
  // r70: no in-memory copy of rendered pages/data (Next keeps up to 50 MB by default) — every MB counts on the 512 MB plan
  cacheMaxMemorySize: 0,
  async headers() {
    // Update 46: the logos and app icons (public/brand, public/icons) are cached by the browser for a day instead of
    // being asked for again on every page (their names never change; a new logo is uploaded through /api/school-logo)
    const day = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [
      { source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") },
      { source: "/brand/:path*", headers: day },
      { source: "/icons/:path*", headers: day },
    ];
  },
};

export default nextConfig;
