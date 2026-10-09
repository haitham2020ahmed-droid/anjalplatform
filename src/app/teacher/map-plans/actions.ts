"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { rebuildDraft, sendPlans, sendToGroup, setBandSettings, updatePlan, type GroupKey, type Subject } from "@/server/map/map-plan";
import { sendCheck } from "@/server/map/map-more";

const back = (f: FormData, msg: string, tab?: string) => `/teacher/map-plans?${new URLSearchParams({ classId: String(f.get("classId") ?? ""), subject: String(f.get("subject") ?? "READING"), tab: tab ?? String(f.get("tab") ?? "plans"), msg })}`;
const subjectOf = (f: FormData): Subject => (f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING");
const dateOf = (v: FormDataEntryValue | null) => (v ? new Date(`${String(v)}T20:59:00Z`) : null);
async function run(f: FormData, job: () => Promise<string>, tab?: string): Promise<never> {
  let msg: string;
  try { msg = await job(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(back(f, msg, tab));
}

export async function savePlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const groups = f.getAll("group").map(String) as GroupKey[];
  await run(f, async () => {
    await updatePlan(repo, actor, String(f.get("planId")), {
      items: groups.map((g) => ({ group: g, keep: f.get(`keep.${g}`) === "on", skillIds: f.getAll(`skill.${g}`).map(String), count: Number(f.get(`count.${g}`)) || 15 })),
      addGroup: (String(f.get("addGroup") ?? "") || null) as GroupKey | null, note: String(f.get("note") ?? ""), dueAt: dateOf(f.get("dueAt")),
    });
    return "✓ Plan saved. Check it, then press Send.";
  });
}

export async function sendPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  await run(f, async () => {
    const r = await sendPlans(repo, actor, f.getAll("planId").map(String));
    return `✓ ${r.sent} plan(s) sent as ${r.sets} MAP set(s). Students were notified.${r.skipped.length ? ` Skipped: ${[...new Set(r.skipped)].join("; ")}.` : ""}`;
  });
}

export async function rebuildPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  await run(f, async () => { await rebuildDraft(repo, actor, String(f.get("planId"))); return "✓ The automatic plan was made again."; });
}

export async function sendGroupAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  await run(f, async () => {
    const r = await sendToGroup(repo, actor, String(f.get("classId")), { group: String(f.get("group")) as GroupKey, low: Number(f.get("low")), high: Number(f.get("high")), studentIds: f.getAll("studentId").map(String), count: Number(f.get("count")) || 15, dueAt: dateOf(f.get("dueAt")) });
    return `✓ Sent to the group (adaptive set from ${r.questions} questions of their band).`;
  }, "groups");
}

export async function sendCheckAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  await run(f, async () => {
    const r = await sendCheck(repo, actor, String(f.get("classId")), subjectOf(f), { dueAt: dateOf(f.get("dueAt")) });
    return `✓ Mid-unit check sent to ${r.students} student(s) (${r.sets} set(s), one per RIT band). The “Now” column updates as they answer.`;
  }, "matrix");
}

export async function saveBandsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  await run(f, async () => { await setBandSettings(repo, actor, { size: Number(f.get("size")), min: Number(f.get("min")), max: Number(f.get("max")) }); return "✓ RIT bands saved."; }, "matrix");
}

