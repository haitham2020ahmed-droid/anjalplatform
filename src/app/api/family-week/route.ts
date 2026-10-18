import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { exportFamilyWeek } from "@/server/reports/family-week-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * GET /api/family-week?lang=en|ar[&studentId=…][&classId=…] — the weekly family report as a PDF: one student (the
 * student themself, their teacher or the admin) or a class in one file, a page per student (the teacher or the admin).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang") === "ar" ? "ar" : "en";
  const sid = q.get("studentId"), cid = q.get("classId");
  const studentId = actor.role === "STUDENT" ? actor.studentId : sid && ID.test(sid) ? sid : null;
  const classId = actor.role !== "STUDENT" && cid && ID.test(cid) ? cid : null;
  try {
    // 🖨 r85: signin=0 leaves out the class sign-in QR + code (a class print by its teacher has it by default)
    const file = await exportFamilyWeek(reportDeps(), actor, { studentId, classId: studentId ? null : classId, lang, signin: q.get("signin") !== "0" });
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
