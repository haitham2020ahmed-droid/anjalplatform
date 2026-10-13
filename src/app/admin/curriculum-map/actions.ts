"use server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap, setStudentLevels } from "@/server/curriculum-map/levels";
import { DEFAULT_TARGET_CORRECT } from "@/server/teacher/assign";
import { getT } from "@/i18n/server";
import { buildSendPreview, sendScope, type SendPreview, type SendScopeKind, type SendScopeResult } from "@/server/curriculum-map/send-scope";

export interface PlaceAssignInput { classId: string; code: string; studentIds?: string[]; mode?: "ADAPTIVE" | "BY_LEVEL"; startLevels?: { studentId: string; level: "ABOVE" | "ON" | "BELOW" }[]; max?: number; dueAt?: string | null; note?: string | null }

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
    const r = await assignFromMap(repo, actor, { classId: input.classId, categoryCode: input.code, studentIds: input.studentIds, mode: input.mode, maxQuestions: input.max, targetCorrect: adaptive ? input.max ?? DEFAULT_TARGET_CORRECT : null, dueAt: due, note: input.note ?? null });
    const LV = { ABOVE: "Above", ON: "On", BELOW: "Below" } as const;
    const parts = r.groups.map((g) => `${g.level ? LV[g.level] : "everyone"}: ${g.students} student(s)`);
    return { ok: true, message: `Assigned ✓ ${parts.join(" · ")}. Students were notified.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}` };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}


export interface ScopeInput { grade: number; kind: SendScopeKind; codes?: string[] | null; classIds?: string[] }
export interface ScopeSendInput extends ScopeInput { studentIds?: string[] | null; exclude?: string[] | null; resend?: boolean; dueAt?: string | null; startAt?: string | null }
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
      exclude: list(input.exclude), resend: input.resend === true, dueAt: day(input.dueAt, true), startAt: day(input.startAt, false),
    });
    const msg = [t("Sent ✓ {n} parts and {m} writing tasks.", { n: r.parts, m: r.writing }), r.alreadySent ? t("{n} parts were already sent and were skipped.", { n: r.alreadySent }) : ""].filter(Boolean).join(" ");
    return { ok: true, message: msg, result: r };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message };
    throw e;
  }
}
