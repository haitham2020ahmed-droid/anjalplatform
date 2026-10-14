/**
 * 📘 The Curriculum Map's Send window: the teacher picks WHAT (one selection, one unit, several units or the whole
 * plan of the grade), sees a Preview of exactly what will be sent (per selection: its sections, question counts,
 * the Respond to Reading writing task, Review), unticks parts, picks the class(es) / students and the dates, and
 * sends. Nothing new is invented here:
 *   • question parts go through sendMapPlan (→ assignFromMap: adaptive, goal = correct answers, one plan per class
 *     the student opens in My Plans), exactly like "Send this unit's plan";
 *   • a Respond to Reading writing task goes through assignRespond with each student's suggested level
 *     (respondAssignPlan), exactly like ⭐ Assign on that section.
 * A part already sent to a class is marked and skipped for that class unless the teacher ticks "Send again".
 * A teacher sends only their own grade (teacherMapGrades) to their own classes; admins: any grade, any class.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { requireSource } from "../assign/source";
import { assertClassAccess } from "../teacher/assignments";
import { curriculumMapView, teacherMapGrades, type MapViewNode } from "./view";
import { unitCards, type SectionKind } from "./lesson-details";
import { sendMapPlan } from "./send-plan";
import { sentCodesByClass, sentOn } from "./sent";
import { respondCodes } from "./respond";
import { assignRespond, respondAssignPlan } from "./respond-assign";

const s = (v: unknown) => String(v ?? "");

export type SendScopeKind = "SELECTION" | "UNIT" | "UNITS" | "PLAN";
/** codes: the selection code (SELECTION), the unit code (UNIT) or the unit codes (UNITS); PLAN: ignored */
export interface SendScope { grade: number; kind: SendScopeKind; codes?: string[] | null }

export interface PreviewSection {
  code: string; title: string; kind: SectionKind | null;
  /** published auto-marked questions on the section (its levels included) */
  questions: number;
  /** Respond to Reading: a writing task exists for this Text Set */
  writing: boolean;
  /** something can be sent (questions or a writing task) */
  ready: boolean;
  /** the chosen classes that already have this part */
  sentTo: { classId: string; name: string; on: string }[];
}
export interface PreviewSelection { code: string; unitCode: string; unit: string; unitNo: number; name: string; genre: string | null; sections: PreviewSection[] }
export interface SendPreview { grade: number; kind: SendScopeKind; title: string; selections: PreviewSelection[]; totals: { selections: number; sections: number; questions: number; writing: number } }

const MAX_CLASSES = 30;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Only teachers and admins; a teacher only their own grade. */
async function assertGrade(repo: Repo, actor: Actor, grade: number): Promise<void> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers and admins can send plans.");
  if (!Number.isInteger(grade) || grade <= 0) throw new ValidationError("Choose a grade.");
  const own = await teacherMapGrades(repo, actor);
  if (own && !own.has(grade)) throw new ForbiddenError("You can only send the Curriculum Map of your own grade.");
}

/** The classes, checked: the actor's own (admins: any of the school), of this grade. */
async function checkClasses(repo: Repo, actor: Actor, grade: number, classIds: string[]): Promise<{ id: string; name: string }[]> {
  const ids = [...new Set(classIds.map(s).filter(Boolean))];
  if (ids.length > MAX_CLASSES) throw new ValidationError(`Choose at most ${MAX_CLASSES} classes.`);
  const out: { id: string; name: string }[] = [];
  const rows: Row[] = [];
  for (const id of ids) rows.push(await assertClassAccess(repo, actor, id));
  const gIds = [...new Set(rows.map((r) => s(r.gradeId)).filter(Boolean))];
  const levelOf = new Map((gIds.length ? await repo.findMany("Grade", { id: { in: gIds } }, { select: ["id", "level"] }) : []).map((g) => [s(g.id), Number(g.level)]));
  for (const r of rows) {
    const lv = levelOf.get(s(r.gradeId));
    if (lv !== undefined && lv !== grade) throw new ValidationError(`${s(r.name)} is Grade ${lv}; this plan is Grade ${grade}.`);
    out.push({ id: s(r.id), name: s(r.name) });
  }
  return out;
}

const sum = (n: MapViewNode): number => n.counts.adaptive + n.children.reduce((a, c) => a + sum(c), 0);

/** The Preview: what the scope holds, and (with classes) what each class already has. */
export async function buildSendPreview(repo: Repo, actor: Actor, scope: SendScope, classIds: string[] = []): Promise<SendPreview> {
  const grade = Math.round(Number(scope.grade));
  await assertGrade(repo, actor, grade);
  const classes = await checkClasses(repo, actor, grade, classIds);
  const v = await curriculumMapView(repo, actor, grade);
  if (v.level !== grade || !v.book) throw new ValidationError(`Grade ${grade} is not on the Curriculum Map.`);
  const units = v.book.children;
  const codes = (scope.codes ?? []).map((c) => s(c).trim().toUpperCase()).filter(Boolean);
  let chosen: MapViewNode[];
  let only: string | null = null;
  let title: string;
  const unitNo = (u: MapViewNode) => units.indexOf(u) + 1;
  if (scope.kind === "SELECTION") {
    const u = units.find((x) => x.children.some((c) => c.code.toUpperCase() === codes[0]));
    if (!u || codes.length !== 1) throw new ValidationError("Choose one selection of the Curriculum Map.");
    chosen = [u]; only = codes[0];
  } else if (scope.kind === "UNIT" || scope.kind === "UNITS") {
    chosen = units.filter((u) => codes.includes(u.code.toUpperCase()));
    if (!chosen.length || chosen.length !== new Set(codes).size || (scope.kind === "UNIT" && chosen.length !== 1)) throw new ValidationError(scope.kind === "UNIT" ? "Choose one unit." : "Choose at least one unit.");
  } else if (scope.kind === "PLAN") chosen = units;
  else throw new ValidationError("Choose what to send.");

  const nodeByCode = new Map<string, MapViewNode>();
  const walk = (n: MapViewNode) => { nodeByCode.set(n.code.toUpperCase(), n); n.children.forEach(walk); };
  chosen.forEach(walk);
  const writingSets = actor.schoolId ? new Set([...(await respondCodes(repo, actor.schoolId).catch(() => new Set<string>()))].map((c) => c.toUpperCase().replace(/\.(BELOW|ON|ABOVE)$/, ""))) : new Set<string>();
  const sentBy = await sentCodesByClass(repo, classes.map((c) => c.id));
  const rtrSent = classes.length ? await repo.findMany("RespondAssignment", { classId: { in: classes.map((c) => c.id) }, deletedAt: null }, { select: ["classId", "setCode", "createdAt"] }) : [];

  const selections: PreviewSelection[] = [];
  for (const u of chosen) {
    const card = unitCards(grade, u);
    for (const l of card.lessons) {
      if (only && l.code.toUpperCase() !== only) continue;
      const sections: PreviewSection[] = l.sections.map((sec) => {
        const code = sec.code.toUpperCase();
        const questions = sum(nodeByCode.get(code) ?? ({ counts: { adaptive: 0 }, children: [] } as unknown as MapViewNode));
        const writing = sec.kind === "RESPOND_TO_READING" && writingSets.has(code);
        const sentTo = classes.flatMap((c) => {
          const q = sentOn(sentBy.get(c.id) ?? new Map(), code);
          const w = writing ? rtrSent.filter((r) => s(r.classId) === c.id && s(r.setCode).toUpperCase() === code).map((r) => new Date(r.createdAt instanceof Date ? r.createdAt : s(r.createdAt)))[0] ?? null : null;
          const on = q && w ? (q > w ? q : w) : q ?? w;
          return on ? [{ classId: c.id, name: c.name, on: iso(on) }] : [];
        });
        return { code: sec.code, title: sec.title, kind: sec.kind, questions, writing, ready: questions > 0 || writing, sentTo };
      });
      selections.push({ code: l.code, unitCode: u.code, unit: `Unit ${unitNo(u)}`, unitNo: unitNo(u), name: l.name, genre: l.genre, sections });
    }
  }
  if (scope.kind === "SELECTION") {
    const sel = selections[0];
    title = `Grade ${grade} · ${sel.unit} · ${sel.name}`;
  } else if (scope.kind === "PLAN") title = `Grade ${grade} Curriculum plan`;
  else {
    const nos = chosen.map(unitNo).sort((a, b) => a - b);
    title = nos.length === 1 ? `Grade ${grade} · Unit ${nos[0]} plan` : `Grade ${grade} · Units ${nos.join(", ")} plan`;
  }
  const all = selections.flatMap((x) => x.sections);
  return {
    grade, kind: scope.kind, title, selections,
    totals: { selections: selections.length, sections: all.filter((x) => x.ready).length, questions: all.reduce((a, x) => a + x.questions, 0), writing: all.filter((x) => x.writing).length },
  };
}

export interface SendScopeInput extends SendScope {
  classIds: string[];
  /** only with one class: these students (default: the whole class) */
  studentIds?: string[] | null;
  /** section codes the teacher unticked in the Preview */
  exclude?: string[] | null;
  /** send again the parts a class already has */
  resend?: boolean;
  dueAt?: Date | null; startAt?: Date | null;
  /** r74: REQUIRED — the Source chosen in the Send window */
  source?: string | null;
}
export interface SendScopeClassResult { classId: string; className: string; planId: string | null; parts: number; writing: number; alreadySent: number; students: number; notes: string[] }
export interface SendScopeResult { title: string; classes: SendScopeClassResult[]; parts: number; writing: number; alreadySent: number }

/** Sends the scope to each chosen class (one plan per class), skipping what a class already has. */
export async function sendScope(repo: Repo, actor: Actor, input: SendScopeInput, now = new Date()): Promise<SendScopeResult> {
  const classIds = [...new Set((input.classIds ?? []).map(s).filter(Boolean))];
  if (!classIds.length) throw new ValidationError("Choose at least one class.");
  const source = requireSource(input.source);
  const studentIds = [...new Set((input.studentIds ?? []).map(s).filter(Boolean))];
  if (studentIds.length && classIds.length !== 1) throw new ValidationError("Choose students in one class only, or send to whole classes.");
  if (input.startAt && input.dueAt && input.startAt > input.dueAt) throw new ValidationError("The due date must be after the start date.");
  const pv = await buildSendPreview(repo, actor, input, classIds);
  const exclude = new Set((input.exclude ?? []).map((c) => s(c).toUpperCase()));
  const picked = pv.selections.flatMap((x) => x.sections).filter((x) => x.ready && !exclude.has(x.code.toUpperCase()));
  if (!picked.length) throw new ValidationError("Choose at least one part to send.");
  const out: SendScopeClassResult[] = [];
  for (const classId of classIds) {
    const klass = await assertClassAccess(repo, actor, classId);
    const r: SendScopeClassResult = { classId, className: s(klass.name), planId: null, parts: 0, writing: 0, alreadySent: 0, students: 0, notes: [] };
    const todo = picked.filter((x) => input.resend || !x.sentTo.some((c) => c.classId === classId));
    r.alreadySent = picked.length - todo.length;
    const qCodes = todo.filter((x) => x.questions > 0).map((x) => x.code);
    if (qCodes.length) {
      try {
        const p = await sendMapPlan(repo, actor, { grade: pv.grade, classId, studentIds: studentIds.length ? studentIds : null, codes: qCodes, title: pv.title, dueAt: input.dueAt ?? null, startAt: input.startAt ?? null, source }, now);
        r.planId = p.planId; r.parts = p.parts; r.students = p.students;
        if (p.skipped.length) r.notes.push(`${p.skipped.length} part(s) have no questions yet and were left out.`);
      } catch (e) {
        if (e instanceof ValidationError) r.notes.push(e.message); else throw e;
      }
    }
    for (const x of todo.filter((t) => t.writing)) {
      try {
        const plan = await respondAssignPlan(repo, actor, classId, x.code);
        const rows = plan.rows.filter((row) => !studentIds.length || studentIds.includes(row.studentId));
        if (!rows.length) continue;
        const w = await assignRespond(repo, actor, { classId, code: x.code, levels: Object.fromEntries(rows.map((row) => [row.studentId, row.suggested])), dueAt: input.dueAt ?? null, note: pv.title }, now);
        r.writing++; r.students = Math.max(r.students, w.students);
      } catch (e) {
        if (e instanceof ValidationError) r.notes.push(e.message); else throw e;
      }
    }
    out.push(r);
  }
  const total = (k: "parts" | "writing" | "alreadySent") => out.reduce((a, x) => a + x[k], 0);
  if (!total("parts") && !total("writing")) {
    if (total("alreadySent")) throw new ValidationError("These parts were already sent to the chosen classes. Tick “Send again” to send them once more.");
    throw new ValidationError(out.flatMap((x) => x.notes)[0] ?? "Nothing could be sent yet: these lessons have no published questions.");
  }
  return { title: pv.title, classes: out, parts: total("parts"), writing: total("writing"), alreadySent: total("alreadySent") };
}
