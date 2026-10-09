"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignSkillByLevel } from "@/server/teacher/skill-assign";

const day = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T23:59:59`) : null; };

export async function assignSkillAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), skillId = String(f.get("skillId") ?? ""), mode = f.get("mode") === "MANUAL" ? "MANUAL" : "AUTOMATIC";
  let msg: string;
  try {
    const levels = Object.fromEntries([...f.keys()].filter((k) => k.startsWith("lv:")).map((k) => [k.slice(3), String(f.get(k) ?? "")]));
    const r = await assignSkillByLevel(repo, actor, { classId, skillId, mode, levels, skip: f.getAll("skip").map(String), dueAt: day(f.get("dueAt")), note: String(f.get("note") ?? "") || null, max: Number(f.get("max") ?? 20) || 20 });
    const parts = r.groups.map((g) => `${g.level ? { BELOW: "Below", ON: "On", ABOVE: "Above" }[g.level] + ": " : ""}${g.students} student(s)`);
    msg = `✅ Assigned. ${parts.join(" · ")}.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/teacher/skill-assign?${new URLSearchParams({ classId, skillId, ...(mode === "MANUAL" ? { manual: "1" } : {}), msg })}`);
}
