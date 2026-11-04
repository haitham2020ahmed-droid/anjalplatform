import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { exportNafsReport } from "@/server/nafs/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/nafs/export?testId=…&classId=…&format=xlsx|pdf[&view=across][&hi=80&lo=50] — a NAFS test's results, or every
 * NAFS test together (view=across), with the teacher's cut-offs (Grade 6 teachers and admins).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const format = q.get("format");
  const id = (k: string) => { const v = q.get(k); return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null; };
  if (format !== "pdf" && format !== "xlsx") return new NextResponse("Unknown format.", { status: 422 });
  const view = q.get("view") === "across" ? "across" : "test";
  const testId = id("testId");
  if (view === "test" && !testId) return new NextResponse("Missing test.", { status: 422 });
  try {
    const file = await exportNafsReport(reportDeps(), actor, { testId, classId: id("classId"), format, view, hi: q.get("hi"), lo: q.get("lo") });
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
