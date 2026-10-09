"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { saveSchoolGoals, sendPlanToGrade } from "@/server/admin/school-goals";

const back = (m: string) => `/admin/school-goals?msg=${encodeURIComponent(m)}`;

export async function saveGoalsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  const units = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ grade: Number(f.get(`g-${i}`)), unit: String(f.get(`u-${i}`) ?? ""), pct: Number(f.get(`p-${i}`)) || 80, by: String(f.get(`d-${i}`) ?? "") })).filter((u) => u.unit.trim());
  let to: string;
  try { await saveSchoolGoals(repo, actor, { weeklyMinutes: Number(f.get("minutes")), weeklyParts: Number(f.get("parts")), units }); to = back("✓ Goals saved. Every teacher sees them on their home page."); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; to = back(`⚠️ ${e.message}`); }
  redirect(to);
}

export async function sendGradePlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  let to: string;
  try {
    const r = await sendPlanToGrade(repo, actor, Number(f.get("grade")), Number(f.get("target")) || 20);
    to = back(`📘 Grade ${String(f.get("grade"))}: ${r.classes} class(es) have the full curriculum plan (${r.created} new).${r.skipped.length ? ` Skipped: ${r.skipped.join(" · ")}` : ""}`);
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; to = back(`⚠️ ${e.message}`); }
  redirect(to);
}
