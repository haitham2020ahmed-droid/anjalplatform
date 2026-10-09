import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { contentDisposition, RateLimitedError } from "@/server/reports/service";
import { exportDiagnostic } from "@/server/diagnostic/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/diagnostic/export?testId=…&classId=…|studentId=…&format=pdf|xlsx|csv */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const format = q.get("format");
  const id = (k: string) => { const v = q.get(k); return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null; };
  if (format !== "pdf" && format !== "xlsx" && format !== "csv") return new NextResponse("Unknown format.", { status: 422 });
  const testId = id("testId");
  if (!testId) return new NextResponse("Missing test.", { status: 422 });
  try {
    const file = await exportDiagnostic(reportDeps(), actor, { testId, classId: id("classId"), studentId: id("studentId"), format });
    return new NextResponse(Buffer.from(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": contentDisposition(file.filename), "Content-Length": String(file.bytes.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
