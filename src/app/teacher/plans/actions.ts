"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createSkillPlan } from "@/server/curriculum-map/plans";
import { sendCurriculumPlan, setOpenUnits } from "@/server/curriculum-map/curriculum-plan";

export async function createPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let target: string;
  try {
    const due = String(f.get("dueAt") ?? "");
    const r = await createSkillPlan(repo, actor, {
      classId, title: String(f.get("title") ?? ""), codes: f.getAll("codes").map(String),
      studentIds: f.get("who") === "some" ? f.getAll("studentIds").map(String) : undefined,
      targetCorrect: Number(f.get("max")) || 20, dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null, note: String(f.get("note") ?? "") || null,
    });
    target = `/teacher/plans/${r.planId}?msg=${encodeURIComponent(`Plan assigned: ${r.items} place(s). Students were notified.${r.skipped.length ? ` Skipped: ${r.skipped.join(" · ")}` : ""}`)}`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    target = `/teacher/plans?classId=${classId}&msg=${encodeURIComponent(e.message)}`;
  }
  redirect(target);
}

/** 📘 Sends (or updates) the full-curriculum plan of a class. */
export async function sendCurriculumPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let target: string;
  try {
    const r = await sendCurriculumPlan(repo, actor, { classId, targetCorrect: Number(f.get("target")) || 20 });
    target = `/teacher/plans/${r.planId}?msg=${encodeURIComponent(r.created ? `Curriculum plan sent: ${r.places} parts. Every student of the class has it in My Plans.` : `Curriculum plan updated (${r.places} parts).`)}`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    target = `${String(f.get("back") || "/teacher/plans")}${String(f.get("back") || "").includes("?") ? "&" : "?"}msg=${encodeURIComponent(e.message)}`;
  }
  redirect(target);
}

/** 🔒 Which units students can open, and the unit calendar. */
export async function setUnitsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const planId = String(f.get("planId") ?? "");
  const units = f.getAll("unit").map(String);
  const open: string[] = [], dates: Record<string, string> = {};
  units.forEach((u, i) => {
    const how = String(f.get(`how-${i}`) ?? "open");
    if (how === "open") open.push(u);
    if (how === "date") { const d = String(f.get(`date-${i}`) ?? ""); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates[u] = d; }
  });
  const allOpen = open.length === units.length;
  let msg = "Units saved.";
  try { await setOpenUnits(repo, actor, planId, allOpen ? null : open, dates); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/plans/${planId}?msg=${encodeURIComponent(msg)}`);
}
