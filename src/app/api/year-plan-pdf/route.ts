import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { exportYearPlanPdf } from "@/server/reports/year-plan-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** GET /api/year-plan-pdf?classId=… — the class's MAP Year plan as a PDF for the administration (teachers and admins). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  if (actor.role === "STUDENT" || actor.role === "PARENT") return new NextResponse("Not found.", { status: 404 });
  const q = new URL(req.url).searchParams;
  const cid = q.get("classId");
  if (!cid || !ID.test(cid)) return new NextResponse("Choose a class.", { status: 422 });
  try {
    // 🖨 r85: signin=0 leaves out the class sign-in QR + code (on by default for the class's teacher)
    const file = await exportYearPlanPdf(reportDeps(), actor, cid, { signin: q.get("signin") !== "0" });
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
