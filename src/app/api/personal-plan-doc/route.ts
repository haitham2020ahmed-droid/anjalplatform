import { NextResponse } from "next/server";
import { apiActor, repo } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { personalPlan } from "@/server/map/personal-plan";
import { personalPlanDoc } from "@/server/map/personal-plan-doc";

export const runtime = "nodejs";

/** ⬇ The Personalized Plan as a Word document (.doc). */
export async function GET(req: Request) {
  const actor = await apiActor();
  if (!actor) return new NextResponse("Sign in.", { status: 401 });
  const q = new URL(req.url).searchParams;
  try {
    const p = await personalPlan(repo, actor, String(q.get("classId")), q.get("subject") === "language" ? "LANGUAGE" : "READING");
    const name = `Personalized-Plan-${p.className}-${p.subject === "READING" ? "Reading" : "Language"}.doc`.replace(/[^\w.-]+/g, "-");
    return new NextResponse("\ufeff" + personalPlanDoc(p), { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (e) { if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 }); throw e; }
}
