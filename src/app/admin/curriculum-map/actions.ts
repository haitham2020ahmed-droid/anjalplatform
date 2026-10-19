"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap, setStudentLevels } from "@/server/curriculum-map/levels";
import { assignSkill, cancelSkillAssignmentsForClass, DEFAULT_TARGET_CORRECT, hasPriorSkillAssignment } from "@/server/teacher/assign";
import { assertClassAccess } from "@/server/teacher/assignments";
import { masteredInClasses } from "@/server/skills/status-extras";
import { DATE_ORDER_ERROR, startOfDay } from "@/lib/assign-dates";
import { getT } from "@/i18n/server";
import { buildSendPreview, sendScope, type SendPreview, type SendScopeKind, type SendScopeResult } from "@/server/curriculum-map/send-scope";
import { sentCodesByClass, sentOn } from "@/server/curriculum-map/sent";

export interface PlaceAssignInput { /** r74: the required Source */ source?: string | null; classId: string; code: string; studentIds?: string[]; mode?: "ADAPTIVE" | "BY_LEVEL"; startLevels?: { studentId: string; level: "ABOVE" | "ON" | "BELOW" }[]; max?: number; dueAt?: string | null; /** r68: students see it from this day */ startAt?: string | null; note?: string | null }

/** ⭐ Assign from the Curriculum Map, without leaving the page. */
export async function assignPlaceAction(input: PlaceAssignInput): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    if (input.studentIds && !input.studentIds.length) throw new ValidationError("Star at least one student, or choose “All students”.");
    const due = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? new Date(`${input.dueAt}T23:59:59`) : null;
    // adaptive: the number is the goal of correct answers (the student may keep practising after it)
    const adaptive = (input.mode ?? "ADAPTIVE") === "ADAPTIVE";
    // ✋ the teacher chose each student's starting level: saved as their level (the set adapts from there)
    if (input.startLevels?.length) await setStudentLevels(repo, actor, input.classId, input.startLevels.filter((x) => ["ABOVE", "ON", "BELOW"].includes(x.level)));
    const startAt = startOfDay(input.startAt);
    if (startAt && due && due.getTime() < startAt.getTime()) throw new ValidationError(DATE_ORDER_ERROR);
    const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: input.code, studentIds: input.studentIds, mode: input.mode, maxQuestions: input.max, targetCorrect: adaptive ? input.max ?? DEFAULT_TARGET_CORRECT : null, dueAt: due, startAt, note: input.note ?? null, source: input.source ?? null });
    const LV = { ABOVE: "Exceeding", ON: "Meeting", BELOW: "Approaching" } as const;
    const parts = r.groups.map((g) => `${g.level ? LV[g.level] : "everyone"}: ${g.students} student(s)`);
    return { ok: true, message: `Assigned ✓ ${parts.join(" · ")}. Students were notified.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

export interface QuickAssignSkillInput { classId: string; skillId: string; /** r74: the required Source (MAP, NAFS, Curriculum, Grammar, RTI) */ source?: string | null; /** empty/omitted = the whole class */ studentIds?: string[]; /** ⭐ "N students already mastered this skill — exclude them?" (the same Yes the Find-a-skill dialog sends) */ excludeMastered?: boolean }

/**
 * ⭐ Quick Assign, from the skill-plan view (owner's "press the star → assign" request): one named skill (not a
 * whole category), adaptive, to a whole class or to one/a few starred students, one click each — same required
 * Source picker as every other assign window (r74 §1; defaults to CURRICULUM when the caller sends none, since
 * the origin IS the Curriculum Map). A teacher who wants levels, dates or a chosen question set still has
 * "More options…" to the full /teacher/skill-assign page.
 */
export async function quickAssignSkillAction(input: QuickAssignSkillInput): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    let studentIds = input.studentIds?.length ? input.studentIds : undefined;
    // ⭐ r## (owner: the same "exclude mastered students" question the Find-a-skill dialog and the full Assign
    // page already ask, now asked here too): same server-side filter assignSkillToClasses's caller uses — mastered
    // students are dropped from the list BEFORE assignSkill ever sees them, not a flag it has to understand.
    if (input.excludeMastered && actor.schoolId) {
      const m = await masteredInClasses(repo, actor.schoolId, [input.classId], input.skillId, studentIds ?? []);
      if (m.mastered.length) {
        studentIds = m.reach.filter((id) => !m.mastered.includes(id));
        if (!studentIds.length) return { ok: false, message: "Every student already mastered this skill." };
      }
    }
    const r = await assignSkill(repo, actor, { classId: input.classId, skillId: input.skillId, studentIds, source: input.source || "CURRICULUM" });
    return { ok: true, message: `Assigned ✓ ${r.students} student(s). They were notified.` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

/** ⭐ How many students in this class already mastered this skill — Skill plan's "All students" asks before
 * duplicating work they have already done, the same question the Find-a-skill dialog and the full Assign page ask. */
export async function masteredCountAction(input: { classId: string; skillId: string }): Promise<{ count: number }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  if (!input.classId || !input.skillId || !actor.schoolId) return { count: 0 };
  try { await assertClassAccess(repo, actor, input.classId); } catch { return { count: 0 }; }
  const m = await masteredInClasses(repo, actor.schoolId, [input.classId], input.skillId);
  return { count: m.mastered.length };
}

/** ⭐ Whether the chosen class already has this skill assigned (any status, not deleted) — Skill plan's ⭐ asks
 * before duplicating the same work, the same question the full /teacher/skill-assign page already asks. */
export async function priorAssignmentAction(input: { classId: string; skillId: string }): Promise<{ assigned: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  if (!input.classId || !input.skillId) return { assigned: false };
  try { await assertClassAccess(repo, actor, input.classId); } catch { return { assigned: false }; }
  return { assigned: await hasPriorSkillAssignment(repo, input.classId, input.skillId) };
}

/** ⭐ Skill plan's un-star ("لو شلت النجمه يتلغي"): cancel every open assignment of this skill for this class.
 * Students stop seeing it; answers already given are kept. The class's teacher (or a school admin) only. */
export async function cancelSkillAssignmentAction(input: { classId: string; skillId: string }): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  try {
    if (!input.classId || !input.skillId) return { ok: false, message: "Choose a class." };
    await assertClassAccess(repo, actor, input.classId);
    const r = await cancelSkillAssignmentsForClass(repo, actor, input.classId, input.skillId);
    if (!r.cancelled) return { ok: false, message: "Nothing to remove — this class has no open assignment of this skill." };
    return { ok: true, message: "Removed ✓ Students no longer see it; their answers are kept." };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

/** ⭐ Whether the chosen class already has this Curriculum Map place (section/category code) sent to it — the
 * "⭐ Assign" window's "assign it again?" prompt, the same question Skill plan and the full Assign page already ask. */
export async function mapCodeSentAction(input: { classId: string; code: string }): Promise<{ sent: boolean }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  if (!input.classId || !input.code) return { sent: false };
  try { await assertClassAccess(repo, actor, input.classId); } catch { return { sent: false }; }
  const m = await sentCodesByClass(repo, [input.classId]);
  return { sent: sentOn(m.get(input.classId) ?? new Map(), input.code) !== null };
}

export interface ScopeInput { grade: number; kind: SendScopeKind; codes?: string[] | null; classIds?: string[] }
export interface ScopeSendInput extends ScopeInput { /** r74: the required Source */ source?: string | null; studentIds?: string[] | null; exclude?: string[] | null; resend?: boolean; dueAt?: string | null; startAt?: string | null }
const day = (v: unknown, end: boolean): Date | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}`) : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** 📘 Send window → Preview: what the chosen selection / unit(s) / whole plan holds, and what each class already has. */
export async function sendPreviewAction(input: ScopeInput): Promise<{ ok: true; preview: SendPreview } | { ok: false; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  try {
    return { ok: true, preview: await buildSendPreview(repo, actor, { grade: Number(input.grade), kind: input.kind, codes: list(input.codes) }, list(input.classIds)) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

/** 📘 Send window → Send: one plan per class (+ Respond to Reading writing tasks); parts a class already has are skipped. */
export async function sendScopeAction(input: ScopeSendInput): Promise<{ ok: boolean; message: string; result?: SendScopeResult }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  try {
    const r = await sendScope(repo, actor, {
      grade: Number(input.grade), kind: input.kind, codes: list(input.codes), classIds: list(input.classIds), studentIds: list(input.studentIds),
      exclude: list(input.exclude), resend: input.resend === true, dueAt: day(input.dueAt, true), startAt: day(input.startAt, false), source: input.source ?? null,
    });
    const msg = [t("Sent ✓ {n} parts and {m} writing tasks.", { n: r.parts, m: r.writing }), r.alreadySent ? t("{n} parts were already sent and were skipped.", { n: r.alreadySent }) : ""].filter(Boolean).join(" ");
    return { ok: true, message: msg, result: r };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}

/** 📘 r79: send the grade's Full curriculum map (PDF) to chosen classes — or stop showing it. Own classes of that grade only (server-checked). */
export async function shareMapPdfAction(input: { grade: number; classIds: string[]; on: boolean }): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const { t } = await getT();
  try {
    const { shareCurriculumMap } = await import("@/server/curriculum-map/map-pdf");
    const r = await shareCurriculumMap(repo, actor, Number(input.grade), list(input.classIds), input.on !== false);
    return { ok: true, message: input.on !== false ? t("Sent to {n} student(s). They find it on their Curriculum page.", { n: r.students }) : t("Students no longer see the curriculum map.") };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: t(e.message) };
    throw e;
  }
}
