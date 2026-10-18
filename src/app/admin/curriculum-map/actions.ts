"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap, setStudentLevels } from "@/server/curriculum-map/levels";
import { assignSkill, DEFAULT_TARGET_CORRECT } from "@/server/teacher/assign";
import { DATE_ORDER_ERROR, startOfDay } from "@/lib/assign-dates";
import { getT } from "@/i18n/server";
import { buildSendPreview, sendScope, type SendPreview, type SendScopeKind, type SendScopeResult } from "@/server/curriculum-map/send-scope";

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

export interface QuickAssignSkillInput { classId: string; skillId: string; /** empty/omitted = the whole class */ studentIds?: string[] }

/**
 * ⭐ Quick Assign, from the new skill-plan view (owner's "press the star → assign" request): one named skill (not a
 * whole category), adaptive, to a whole class or to one/a few starred students, one click each. No Source picker —
 * the origin IS the Curriculum Map, so the assignment is tagged CURRICULUM automatically (same tag the map's other
 * actions use). A teacher who wants levels, dates or a chosen question set still has "More options…" to the full
 * /teacher/skill-assign page.
 */
export async function quickAssignSkillAction(input: QuickAssignSkillInput): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  try {
    const r = await assignSkill(repo, actor, { classId: input.classId, skillId: input.skillId, studentIds: input.studentIds?.length ? input.studentIds : undefined, source: "CURRICULUM" });
    return { ok: true, message: `Assigned ✓ ${r.students} student(s). They were notified.` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
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
