import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { cleanMode } from "@/server/nafs/compare";
import { exportNafsCompare } from "@/server/nafs/compare-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/nafs/compare?format=xlsx|pdf&mode=tests|practice|all[&classId=…][&a=…&b=…][&from=…&to=…][&preset=month] —
 * the NAFS Compare report (did the students go up or down?) as a file (Grade 6 teachers: their classes; admins: the school).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const format = q.get("format");
  if (format !== "pdf" && format !== "xlsx") return new NextResponse("Unknown format.", { status: 422 });
  const id = (k: string) => { const v = q.get(k); return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null; };
  try {
    const file = await exportNafsCompare(reportDeps(), actor, { mode: cleanMode(q.get("mode")), classId: id("classId"), a: id("a"), b: id("b"), from: q.get("from"), to: q.get("to"), preset: q.get("preset"), format });
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
