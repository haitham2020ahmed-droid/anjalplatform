"use server";
import { deleteAssignDraft, saveAssignDraft, sendAssignDraft, withdrawAssignments } from "@/server/teacher/assign-drafts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { repo, requireActor } from "@/server/auth/next";
import { createAssignment } from "@/server/teacher/assignments";
import { assignedSkillIds, assignQuestions, assignSkillToClasses, trackOf } from "@/server/teacher/assign";
import { resolveAlert } from "@/server/teacher/interventions";
import { masteredInClasses } from "@/server/skills/status-extras";
import { assertClassAccess } from "@/server/teacher/assignments";
import { ValidationError } from "@/server/curriculum-admin";
import { parseQuestionIdsField, programOf } from "@/components/skill-picker/helpers";
import { startOfDay } from "@/lib/assign-dates";
import { studentSkillAccuracy } from "@/server/plans/perf-suggest";
import { toggleFavoriteReport } from "@/server/teacher/favorites";
import { toggleWatchStudent } from "@/server/teacher/watchlist";

const id = z.string().min(1).max(191);

export async function resolveAlertAction(f: FormData) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await resolveAlert(repo, actor, id.parse(f.get("alertId")));
  revalidatePath(`/teacher/classes/${id.parse(f.get("classId"))}`);
}

export async function createAssignmentAction(_: { error?: string }, f: FormData): Promise<{ error?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = id.parse(f.get("classId"));
  const target = z.enum(["SKILL", "UNIT"]).parse(f.get("target"));
  const due = String(f.get("dueAt") ?? "");
  try {
    await createAssignment(repo, actor, {
      classId, title: String(f.get("title") ?? ""), target,
      skillIds: target === "SKILL" ? f.getAll("skillIds").map(String) : undefined,
      unitId: target === "UNIT" ? String(f.get("unitId") ?? "") : undefined,
      dueAt: due ? new Date(`${due}T23:59:00`) : null, startAt: startOfDay(f.get("startAt")),
      targetMastery: z.coerce.number().int().min(40).max(100).parse(f.get("targetMastery") ?? 75),
      source: String(f.get("source") ?? ""),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  redirect(`/teacher/classes/${classId}`);
}

// ------------------------------------------------------------------ ⭐ Assign a skill


/** Dates from <input type="date"> are school days in Saudi time: start of day / end of day. */
const day = (v: FormDataEntryValue | null, end: boolean): Date | null => {
  const t = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return new Date(`${t}T${end ? "23:59:59" : "00:00:00"}+03:00`);
};

export async function assignSkillAction(_: { error?: string; message?: string; assignmentIds?: string[] }, f: FormData): Promise<{ error?: string; message?: string; assignmentIds?: string[]; draft?: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const mode = String(f.get("mode") ?? "class");
    const picked = f.getAll("studentIds").map(String).filter(Boolean);
    if (mode !== "class" && picked.length === 0) return { error: "Choose at least one student." };
    if (mode === "one" && picked.length !== 1) return { error: "Choose exactly one student." };
    // one or several of the teacher's classes (the dialog lists them all); older forms send one classId
    const classIds = [...new Set(f.getAll("classIds").map(String).filter(Boolean))];
    if (!classIds.length && f.get("classId")) classIds.push(String(f.get("classId")));
    // 📝 Save as draft: nothing reaches students; sent later from Weekly Assignments → Drafts
    if (f.get("intent") === "draft") {
      const ymd = (v: FormDataEntryValue | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
      await saveAssignDraft(repo, actor, { skillId: String(f.get("skillId") ?? ""), skillName: String(f.get("skillName") ?? "Skill"), classIds, studentIds: mode === "class" ? [] : picked, track: trackOf(f.get("track")), program: (programOf(f.get("program")) as string | null) ?? null, source: String(f.get("source") ?? ""), questionIds: parseQuestionIdsField(f.get("questionIds")) ?? null, startAt: ymd(f.get("startAt")), dueAt: ymd(f.get("dueAt")), note: String(f.get("note") ?? "") });
      revalidatePath("/teacher/assignments");
      return { message: "Saved as a draft. Nothing was sent. Send it from Weekly Assignments → Drafts.", draft: true };
    }
    // ⭐ "N students already mastered this skill — exclude them?" → Yes: only the others get it
    let studentIds = mode === "class" ? [] : picked;
    if (f.get("excludeMastered") === "1" && actor.schoolId) {
      const m = await masteredInClasses(repo, actor.schoolId, classIds, String(f.get("skillId") ?? ""), studentIds);
      if (m.mastered.length) {
        studentIds = m.reach.filter((id) => !m.mastered.includes(id));
        if (!studentIds.length) return { error: "Every student already mastered this skill." };
      }
    }
    const r = await assignSkillToClasses(repo, actor, { track: trackOf(f.get("track")),
      classIds, skillId: String(f.get("skillId") ?? ""), studentIds,
      startAt: day(f.get("startAt"), false), dueAt: day(f.get("dueAt"), true), note: String(f.get("note") ?? ""),
      program: programOf(f.get("program")), questionIds: parseQuestionIdsField(f.get("questionIds")),
      questionCount: f.get("questionCount") ? Number(f.get("questionCount")) : null,
      source: String(f.get("source") ?? ""),
    });
    revalidatePath("/teacher/assignments");   // not the skills page: rebuilding it after every click made assigning slow
    return { message: `Assigned to ${r.students} student${r.students === 1 ? "" : "s"}${r.classes > 1 ? ` in ${r.classes} classes` : ""}. They have been notified.`, assignmentIds: r.assignmentIds };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

// ------------------------------------------------------------------ ⭐ assign chosen questions

export async function assignQuestionsAction(_: { error?: string; message?: string }, f: FormData): Promise<{ error?: string; message?: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const mode = String(f.get("mode") ?? "class");
    const picked = f.getAll("studentIds").map(String).filter(Boolean);
    if (mode !== "class" && picked.length === 0) return { error: "Choose at least one student." };
    if (mode === "one" && picked.length !== 1) return { error: "Choose exactly one student." };
    const r = await assignQuestions(repo, actor, {
      track: trackOf(f.get("track")),
      classId: String(f.get("classId") ?? ""), questionIds: f.getAll("questionIds").map(String), studentIds: mode === "class" ? [] : picked,
      title: String(f.get("title") ?? ""), startAt: day(f.get("startAt"), false), dueAt: day(f.get("dueAt"), true), note: String(f.get("note") ?? ""),
      source: String(f.get("source") ?? ""),
    });
    revalidatePath("/teacher/assignments");
    return { message: `${r.questions} question${r.questions === 1 ? "" : "s"} assigned to ${r.students} student${r.students === 1 ? "" : "s"}. They have been notified.` };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { error: (e as Error).message };
    throw e;
  }
}

// ------------------------------------------------------------------ 📝 Review & Send: withdraw, drafts

/** ↩ Withdraw work just sent (from the assign dialog). */
export async function withdrawAssignmentsAction(ids: string[]): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const n = await withdrawAssignments(repo, actor, Array.isArray(ids) ? ids.map(String) : []);
    revalidatePath("/teacher/assignments");
    return { ok: true, message: n ? "Withdrawn. It is no longer on the students' lists." : "Nothing to withdraw." };
  } catch (e) {
    if (e instanceof ValidationError || (e as { status?: number }).status === 403) return { ok: false, message: (e as Error).message };
    throw e;
  }
}

export async function sendDraftAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  let msg: string;
  try { const r = await sendAssignDraft(repo, actor, String(f.get("draftId") ?? "")); msg = `✓ Sent to ${r.students} student(s). They have been notified.`; }
  catch (e) { if (e instanceof ValidationError || (e as { status?: number }).status === 403) msg = `⚠️ ${(e as Error).message}`; else throw e; }
  revalidatePath("/teacher/assignments");
  redirect(`/teacher/assignments?msg=${encodeURIComponent(msg)}`);
}

export async function deleteDraftAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  await deleteAssignDraft(repo, actor, String(f.get("draftId") ?? "")).catch(() => undefined);
  revalidatePath("/teacher/assignments");
  redirect(`/teacher/assignments?msg=${encodeURIComponent("Draft deleted.")}`);
}

/** ⭐ The Assign window's prompt: how many of the students it would reach already mastered the skill. */
export async function masteredCountAction(input: { classIds: string[]; skillId: string; studentIds?: string[] }): Promise<{ count: number }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classIds = [...new Set((input?.classIds ?? []).map(String).filter(Boolean))].slice(0, 20);
  try { for (const id of classIds) await assertClassAccess(repo, actor, id); } catch { return { count: 0 }; }
  const m = await masteredInClasses(repo, actor.schoolId!, classIds, String(input?.skillId ?? ""), (input?.studentIds ?? []).map(String));
  return { count: m.mastered.length };
}

/** ⭐ Whether any of the chosen classes already has this skill assigned — the "Find a skill" Assign dialog asks
 * before duplicating the same work, the same question the full /teacher/skill-assign page already asks. */
export async function priorAssignmentAction(input: { classIds: string[]; skillId: string }): Promise<{ assigned: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classIds = [...new Set((input?.classIds ?? []).map(String).filter(Boolean))].slice(0, 20);
  if (!classIds.length || !input?.skillId) return { assigned: false };
  try { for (const id of classIds) await assertClassAccess(repo, actor, id); } catch { return { assigned: false }; }
  const ids = await assignedSkillIds(repo, classIds);
  return { assigned: ids.has(String(input.skillId)) };
}

/** 🆕 r90 (multi-expert audit, Oct 2026): the Assign dialog's "one student" mode asks this when the teacher picks
 * Enrichment as Source, so it can warn (never block) if the student isn't actually excelling on this skill yet by
 * the platform's own data. `acc: null` means not enough data to judge either way (also worth a soft warning). */
export async function studentAccuracyAction(input: { classId: string; studentId: string; skillId: string }): Promise<{ acc: number | null }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const classId = String(input?.classId ?? ""), studentId = String(input?.studentId ?? ""), skillId = String(input?.skillId ?? "");
  if (!classId || !studentId || !skillId) return { acc: null };
  try { await assertClassAccess(repo, actor, classId); } catch { return { acc: null }; }
  const acc = await studentSkillAccuracy(repo, actor, classId, studentId, skillId);
  return { acc };
}

/** 🆕 Oct 2026 (daily-reports consolidation): pin/unpin a report to the top of the Reports hub. */
export async function toggleFavoriteReportAction(reportKey: string): Promise<{ favorited: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER"] });
  const r = await toggleFavoriteReport(repo, actor, reportKey);
  revalidatePath("/teacher/reports");
  return r;
}

/** 🆕 Oct 2026 (daily-reports consolidation): toggle a student on the teacher's own watchlist. */
export async function toggleWatchStudentAction(studentId: string, note?: string): Promise<{ watching: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER"] });
  const r = await toggleWatchStudent(repo, actor, studentId, note);
  revalidatePath("/teacher/watchlist");
  return r;
}
