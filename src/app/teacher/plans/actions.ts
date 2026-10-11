"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError, type Actor } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { createSkillPlan } from "@/server/curriculum-map/plans";
import { assignPlan } from "@/server/plans/wizard";
import { readWizardForm } from "./wizard-form";
import { sendCurriculumPlan, setOpenUnits } from "@/server/curriculum-map/curriculum-plan";
import { getT } from "@/i18n/server";
import { skillsByIds } from "@/server/plans/wizard";
import { suggestNafsPlan } from "@/server/plans/nafs-suggest";
import { fromFormData, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, picksOf, sendProgramPlan } from "@/server/plans/send";

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
    target = `/teacher/plans/curriculum?classId=${classId}&msg=${encodeURIComponent(e.message)}`;
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
    const { t } = await getT();
    target = `/teacher/plans/${r.planId}?msg=${encodeURIComponent(r.created ? t("Curriculum plan assigned: {n} parts. Every student of the class has it in My Plans.", { n: r.places }) : t("Curriculum plan updated ({n} parts).", { n: r.places }))}`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    target = `${String(f.get("back") || "/teacher/plans/curriculum")}${String(f.get("back") || "").includes("?") ? "&" : "?"}msg=${encodeURIComponent(e.message)}`;
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
  const { t } = await getT();
  let msg = t("Units saved.");
  try { await setOpenUnits(repo, actor, planId, allOpen ? null : open, dates); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = e.message; }
  redirect(`/teacher/plans/${planId}?msg=${encodeURIComponent(msg)}`);
}

/** 🗂️ Plans wizard: Assign (the plan is built again on the server from the form; nothing from the browser is trusted). */
export async function assignPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const w = readWizardForm((k) => (f.get(k) === null ? null : String(f.get(k))), (k) => f.getAll(k).map(String));
  const back = `/teacher/plans?${new URLSearchParams([["classId", w.classId], ["who", w.who], ["type", w.type ?? ""], ...w.studentIds.map((id) => ["sid", id])])}`;
  const { t } = await getT();
  let target: string;
  try {
    if (!w.type) throw new ValidationError("Choose a plan type.");
    if (w.who !== "class" && !w.studentIds.length) throw new ValidationError(w.who === "student" ? "Choose the student." : "Choose the students of the group.");
    const due = String(f.get("dueAt") ?? "");
    const r = await assignPlan(repo, actor, {
      classId: w.classId, studentIds: w.studentIds, type: w.type, grade: w.grade, unitId: w.unitId, subject: w.subject, areas: w.areas,
      // Custom: the chosen skills ARE the plan; other types: the proposal, edited (keep) + added skills
      skillIds: w.type === "CUSTOM" ? w.skillIds : [], add: w.type === "CUSTOM" ? [] : w.skillIds, keep: w.keep,
      title: String(f.get("title") ?? "") || null, note: String(f.get("note") ?? "") || null,
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null,
    });
    target = `/teacher/plans/${r.planId}?msg=${encodeURIComponent(`${t("Plan assigned: {skills} skill(s) to {students} student(s). It is in their My Plans and the skills are in their My Work.", { skills: r.skills, students: r.students })}${r.notes.length ? ` ${t("Note:")} ${r.notes.map((n) => t(n)).join(" ")}` : ""}`)}`;
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    target = `${back}&msg=${encodeURIComponent(t(e.message))}`;
  }
  redirect(target);
}

/**
 * Plans page → NAFS plan or Custom plan: the plan is built again on the server (the NAFS suggestion, the teacher's
 * ticks and added skills; Custom = the chosen skills for every chosen student), then goes to the students
 * (program NAFS; a custom plan has no program).
 */
async function sendFromPlansPage(actor: Actor, f: FormData, kind: "nafs" | "custom"): Promise<void> {
  const { get, getAll } = fromFormData(f);
  const areas = getAll("area").filter(Boolean);
  const form = readPlanForm(get, getAll, [kind === "nafs" ? areas.join(",") : "custom"]);
  const { t } = await getT();
  let msg: string, tab: string = kind;
  try {
    const added = await skillsByIds(repo, actor, form.add);
    let plan;
    if (kind === "nafs") {
      const sug = await suggestNafsPlan(repo, actor, { classId: form.classId, studentIds: form.studentIds, areas: areas.length ? areas : null });
      plan = applyEdits(sug.skills, form.keep, added, sug.students.map((x) => x.id));
    } else {
      const members = (await repo.findMany("ClassMembership", { classId: form.classId, leftAt: null }, { select: ["studentId"] })).map((m) => String(m.studentId));
      plan = applyEdits([], null, added, form.studentIds.length ? form.studentIds : members);
    }
    const r = await sendProgramPlan(repo, actor, { classId: form.classId, program: kind === "nafs" ? "NAFS" : null, title: form.title, picks: picksOf(plan), dueAt: form.dueAt, note: form.note, questionIds: readQuestionPicks(get, plan.map((k) => k.id)) });
    msg = t("Plan ready: {skills} skill(s) for {students} student(s). They see it in My Plans and My Work.", { skills: r.skills, students: r.students });
    tab = "sent";
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    msg = t(e.message);
  }
  redirect(`/teacher/plans?${new URLSearchParams({ tab, classId: form.classId, msg })}`);
}

export async function sendNafsPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  await sendFromPlansPage(actor, f, "nafs");
}

export async function sendCustomPlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  await sendFromPlansPage(actor, f, "custom");
}
