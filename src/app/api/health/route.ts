import { NextResponse } from "next/server";
import { repo } from "@/server/auth/next";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness for load balancers, Docker HEALTHCHECK and monitoring.
 * Public by design: it reveals nothing but "ok" / "database unavailable".
 */
export async function GET() {
  const started = Date.now();
  try {
    await repo.count("School", {});
    return NextResponse.json({ status: "ok", db: "ok", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", db: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
