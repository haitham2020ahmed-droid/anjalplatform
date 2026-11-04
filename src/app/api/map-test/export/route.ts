import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { exportMapTest } from "@/server/map/map-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/map-test/export?id=…&subject=READING|LANGUAGE&format=xlsx|pdf — one MAP test's results (teacher / admin). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const format = q.get("format");
  const id = q.get("id");
  if (format !== "pdf" && format !== "xlsx") return new NextResponse("Unknown format.", { status: 422 });
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new NextResponse("Missing test.", { status: 422 });
  try {
    const file = await exportMapTest(reportDeps(), actor, { id, subject: q.get("subject") === "LANGUAGE" ? "LANGUAGE" : q.get("subject") === "READING" ? "READING" : null, format });
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
