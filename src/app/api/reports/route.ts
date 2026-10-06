import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { contentDisposition, exportReport, parseReportRequest, RateLimitedError } from "@/server/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a report: GET /api/reports?kind=student&studentId=…&format=pdf&lang=ar&period=TERM
 * Read-only apart from the audit entry, so GET (and plain links) are appropriate;
 * session cookies are SameSite, and every request is permission-checked server-side.
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  try {
    const r = parseReportRequest(new URL(req.url).searchParams);
    const file = await exportReport(reportDeps(), actor, r);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": contentDisposition(file.filename),
        "Content-Length": String(file.bytes.length),
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    // forbidden and not-found look the same, so report links cannot be used to probe for students or classes
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
