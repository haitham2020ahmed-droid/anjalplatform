import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { ReportBusyError } from "@/reports/pdf";
import { reportDeps } from "@/server/reports/runtime";
import { reportFileResponse } from "@/server/reports/file-response";
import { RateLimitedError } from "@/server/reports/service";
import { exportCurriculumMapPdf } from "@/server/curriculum-map/map-pdf";
import { getLang } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/curriculum-map-pdf?grade=4&copy=staff|student&lang=en|ar — the grade's Full curriculum map (r79 §A).
 * Staff: the grades they may see on the Curriculum Map (either copy). Students: the student copy of a map sent to
 * one of their classes. Kept a few minutes per school + grade + copy + language (the map rarely changes).
 */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Please sign in.", { status: 401 });
  if (actor.role === "PARENT") return new NextResponse("Not found.", { status: 404 });
  const q = new URL(req.url).searchParams;
  const grade = Number(q.get("grade"));
  if (!/^\d{1,2}$/.test(String(q.get("grade") ?? ""))) return new NextResponse("Choose a grade.", { status: 422 });
  const copy = actor.role === "STUDENT" ? "student" : q.get("copy") === "student" ? "student" : "staff";
  const lang = q.get("lang") === "ar" || q.get("lang") === "en" ? (q.get("lang") as "ar" | "en") : await getLang();
  try {
    const file = await exportCurriculumMapPdf(reportDeps(), actor, grade, copy, lang);
    return reportFileResponse(req, file); // r84: a print page (default) or a file
  } catch (e) {
    if (e instanceof ValidationError) return new NextResponse(e.message, { status: 422 });
    if (e instanceof RateLimitedError) return new NextResponse(e.message, { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } });
    if (e instanceof ReportBusyError) return new NextResponse(e.message, { status: 503, headers: { "Retry-After": "30" } });
    if (e instanceof ForbiddenError || (e as { status?: number }).status === 403) return new NextResponse("Not found.", { status: 404 });
    throw e;
  }
}
