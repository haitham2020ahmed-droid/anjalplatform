/**
 * 🇸🇦 NAFS center → MINISTRY BOOKLETS (owner r69): the 100 model booklets in one place —
 *   - the list (code, title, informational / literary, questions, written answers, given? results?) with words / kind
 *     filters — one pass over the cached NAFS index, nothing per booklet;
 *   - OPEN a booklet: its passage and ALL its questions with the answers (the key, the model answer and rubric of a
 *     written answer, the explanation, the standard, the skill, the difficulty) — at most 60 questions read;
 *   - select ONE or SEVERAL booklets and ASSIGN them: each booklet becomes (once) a NAFS test of the school — the whole
 *     booklet in its own order, 45 minutes like the Ministry model, mode MINISTRY with settings { booklet, whole } — and
 *     is given online to a Grade 6 class (or chosen students), or made ready to print (booklet, key, bubble sheets);
 *   - a REPORT per booklet: how the class did on it (per standard, per question, the distractors) — the booklet's test
 *     with the most results, read by the same NAFS test report (never a second copy of the report code).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertNafs } from "../teacher/nafs-access";
import { accessibleClasses } from "../teacher/assign";
import { DIFFICULTY_NAME, MAX_NAFS_MINUTES, type Difficulty } from "./framework";
import { loadNafsQuestions, nafsIndex, usable } from "./bank";
import { setChoices, MINISTRY_DEFAULT, type SetChoice } from "./build";
import { grade6Class, json, saveNafsTest } from "./tests";
import { audit } from "../audit";
import { requireSource, type AssignSource } from "../assign/source";
import { withLock } from "../lib/key-lock";

const s = (v: unknown) => String(v ?? "");
/** One assignment sends at most this many booklets (a class does one or two at a time). */
export const MAX_ASSIGN_BOOKLETS = 10;
const CODE = /^NB-[A-Za-z0-9-]{1,12}$/;

export interface BookletRow extends SetChoice { tests: string[]; results: number }

/** The booklet code of a saved test when it is a WHOLE model booklet (else null). */
export function wholeBookletOf(t: Record<string, unknown>): string | null {
  if (s(t.mode) !== "MINISTRY") return null;
  const st = json<Record<string, unknown> | null>(t.settings, null);
  return st && typeof st.booklet === "string" && CODE.test(st.booklet) && st.whole === true ? st.booklet : null;
}

/** The school's tests that are whole model booklets (newest first; bounded) → code → test ids. */
async function bookletTests(repo: Repo, schoolId: string): Promise<Map<string, string[]>> {
  const rows = await repo.findMany("NafsTest", { schoolId, deletedAt: null, mode: "MINISTRY" }, { select: ["id", "mode", "settings"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 400 });
  const out = new Map<string, string[]>();
  for (const t of rows) { const code = wholeBookletOf(t); if (code) out.set(code, [...(out.get(code) ?? []), s(t.id)]); }
  return out;
}

/** The booklets (with words / kind filters), each with its tests and the results in the actor's classes. */
export async function bookletList(repo: Repo, actor: Actor, f: { q?: string | null; kind?: string | null } = {}): Promise<BookletRow[]> {
  await assertNafs(repo, actor);
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const [choices, tests] = await Promise.all([setChoices(repo, actor, "BOOKLET"), bookletTests(repo, actor.schoolId)]);
  const allTests = [...tests.values()].flat();
  const mine = allTests.length ? (await accessibleClasses(repo, actor)).map((c) => s(c.id)) : [];
  const results = allTests.length && mine.length ? await repo.findMany("NafsResult", { testId: { in: allTests }, classId: { in: mine }, submittedAt: { not: null } }, { select: ["testId"], take: 20000 }) : [];
  const count = new Map<string, number>();
  for (const r of results) count.set(s(r.testId), (count.get(s(r.testId)) ?? 0) + 1);
  const q = s(f.q).trim().toLowerCase();
  const kind = f.kind === "LIT" || f.kind === "INFO" ? f.kind : null;
  return choices
    .filter((b) => (!kind || b.kind === kind) && (!q || `${b.code} ${b.title} ${b.genre}`.toLowerCase().includes(q)))
    .map((b) => { const ids = tests.get(b.code) ?? []; return { ...b, tests: ids, results: ids.reduce((a, id) => a + (count.get(id) ?? 0), 0) }; });
}

export interface BookletOpen {
  code: string; title: string; kind: "LIT" | "INFO" | null; genre: string;
  passage: { title: string; paragraphs: string[] } | null;
  questions: { id: string; n: number; stem: string; options: string[]; correct: number; kind: "MCQ" | "WRITTEN"; model: string; rubric: string[]; why: string; standard: string | null; skill: string; process: string; difficulty: Difficulty; difficultyName: string }[];
}

/** One booklet with its passage and every question with the answer (teacher-facing). */
export async function openBookletView(repo: Repo, actor: Actor, code: string): Promise<BookletOpen> {
  await assertNafs(repo, actor);
  if (!actor.schoolId || !CODE.test(s(code))) throw new ValidationError("Booklet not found.");
  const entries = (await nafsIndex(repo, actor.schoolId)).filter((e) => e.booklet === code && usable(e)).sort((a, b) => (a.bookletN ?? 0) - (b.bookletN ?? 0)).slice(0, 60);
  if (!entries.length) throw new ValidationError("Booklet not found.");
  const meta = (await setChoices(repo, actor, "BOOKLET")).find((b) => b.code === code);
  const qs = await loadNafsQuestions(repo, entries.map((e) => e.id));
  const byId = new Map(qs.map((q) => [q.id, q]));
  const first = qs.find((q) => q.passage)?.passage ?? null;
  const paragraphs = (t: string) => { const x = t.replace(/\r\n/g, "\n").trim(); return (/\n\s*\n/.test(x) ? x.split(/\n\s*\n/) : x.split("\n")).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean); };
  return {
    code, title: meta?.title ?? first?.title ?? code, kind: meta?.kind ?? null, genre: meta?.genre ?? "",
    passage: first ? { title: first.title, paragraphs: paragraphs(first.text) } : null,
    questions: entries.map((e, i) => {
      const q = byId.get(e.id);
      return { id: e.id, n: e.bookletN ?? i + 1, stem: q?.stem ?? "", options: q?.options ?? [], correct: q?.correct ?? -1, kind: q?.kind ?? e.kind, model: q?.model ?? "", rubric: q?.rubric ?? [], why: q?.explanation ?? "", standard: e.standard, skill: e.nafsCode, process: e.process, difficulty: e.difficulty, difficultyName: DIFFICULTY_NAME[e.difficulty] };
    }),
  };
}

/**
 * The school's test of each booklet (the whole booklet, its own order): the existing one when it is still the same
 * questions, else a new one (45 minutes, mode MINISTRY). Returns the test ids in the booklets' order.
 */
export async function ensureBookletTests(repo: Repo, actor: Actor, codesIn: string[], now = new Date()): Promise<{ code: string; testId: string; created: boolean }[]> {
  await assertNafs(repo, actor);
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const codes = [...new Set((codesIn ?? []).map(s).filter((c) => CODE.test(c)))];
  if (!codes.length) throw new ValidationError("Choose at least one booklet.");
  if (codes.length > MAX_ASSIGN_BOOKLETS) throw new ValidationError(`Choose at most ${MAX_ASSIGN_BOOKLETS} booklets at a time.`);
  const idx = (await nafsIndex(repo, actor.schoolId)).filter(usable);
  const meta = new Map((await setChoices(repo, actor, "BOOKLET")).map((b) => [b.code, b]));
  const existing = await repo.findMany("NafsTest", { schoolId: actor.schoolId, deletedAt: null, mode: "MINISTRY" }, { select: ["id", "mode", "settings", "questionIds"], orderBy: [{ field: "createdAt", dir: "desc" }], take: 400 });
  const out: { code: string; testId: string; created: boolean }[] = [];
  for (const code of codes) {
    const ids = idx.filter((e) => e.booklet === code).sort((a, b) => (a.bookletN ?? 0) - (b.bookletN ?? 0)).map((e) => e.id);
    if (!ids.length) throw new ValidationError(`The model booklet ${code} is not in the NAFS bank.`);
    const same = existing.find((t) => wholeBookletOf(t) === code && JSON.stringify(json<string[]>(t.questionIds, [])) === JSON.stringify(ids));
    if (same) { out.push({ code, testId: s(same.id), created: false }); continue; }
    const title = `${code} · ${meta.get(code)?.title ?? "Model booklet"}`.slice(0, 150);
    const testId = await saveNafsTest(repo, actor, { title, mode: "MINISTRY", questionIds: ids, timeLimitMin: MINISTRY_DEFAULT.minutes, settings: { booklet: code, whole: true, written: true, questions: ids.length, minutes: MINISTRY_DEFAULT.minutes } }, now);
    out.push({ code, testId, created: true });
  }
  return out;
}

/** "Assign online" (one class; older callers): see assignBookletsTo. */
export async function assignBooklets(repo: Repo, actor: Actor, input: { codes: string[]; classId: string; studentIds?: string[] | null; minutes?: number | null; openAt?: Date | null; dueAt?: Date | null; source?: string | null }, now = new Date()): Promise<{ booklets: number; students: number; tests: string[] }> {
  const r = await assignBookletsTo(repo, actor, { codes: input.codes, classIds: [input.classId], studentIds: input.studentIds ?? null, minutes: input.minutes ?? null, openAt: input.openAt ?? null, dueAt: input.dueAt ?? null, source: input.source ?? "NAFS", mode: "ONLINE" }, now);
  return { booklets: r.booklets, students: r.students, tests: r.tests.map((x) => x.testId) };
}

export type BookletMode = "ONLINE" | "PAPER";
export interface BookletAssignInput {
  codes: string[];
  /** the teacher's Grade 6 class(es) */
  classIds: string[];
  /** only these students (of the chosen classes); null / empty = the whole class(es) */
  studentIds?: string[] | null;
  /** r74: REQUIRED (the NAFS center preselects NAFS; the teacher may change it) */
  source: string | null | undefined;
  minutes?: number | null; openAt?: Date | null; dueAt?: Date | null;
  /** ONLINE: students take it in the platform · PAPER: ready to print (booklet, key, bubble sheets) */
  mode: BookletMode;
  /** one press of Assign: the same token again (a double press) returns the first answer — nothing is given twice */
  token?: string | null;
}
export interface BookletAssignResult { mode: BookletMode; booklets: number; students: number; classes: number; source: AssignSource; tests: { code: string; testId: string }[] }

/** The classes the booklets may be given to at once. */
export const MAX_ASSIGN_CLASSES = 12;
/** Recent presses (user + token → answer), bounded and short-lived. */
const presses = new Map<string, { at: number; r: Promise<BookletAssignResult> }>();
const PRESS_MS = 10 * 60_000;
function remember(key: string, r: Promise<BookletAssignResult>, now: number): void {
  for (const [k, v] of presses) { if (now - v.at > PRESS_MS || presses.size > 300) presses.delete(k); else break; }
  presses.set(key, { at: now, r });
  r.catch(() => presses.delete(key)); // a refused press can be corrected and sent again
}

/**
 * 🇸🇦 r82 ASSIGN BOOKLETS (owner: "let me assign from here, even several booklets at once — and show the SOURCES"):
 * the ticked booklets (1–10) → each one becomes (once) the school's test of that booklet, then
 *   - ONLINE: given to every chosen class (whole class or chosen students) with its source (r74 — saved with the
 *     booklet's test per class: settings.sourceByClass, no new column), its time and dates; ONE batch of notifications
 *     for all the booklets; a booklet cancelled earlier on the Assigned page and given again comes back;
 *   - PAPER: ready to print (booklet, key, bubble sheets) — nothing is sent to the students.
 * Light: one class check per class, one read of the members, one write per booklet and class, the notifications in one
 * batch. One at a time per school (a double press waits and finds the work already there; the same token returns the
 * first answer, so the students are never notified twice).
 */
export async function assignBookletsTo(repo: Repo, actor: Actor, input: BookletAssignInput, now = new Date()): Promise<BookletAssignResult> {
  await assertNafs(repo, actor);
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const source = requireSource(input.source);
  const mode: BookletMode = input.mode === "PAPER" ? "PAPER" : "ONLINE";
  const classIds = [...new Set((input.classIds ?? []).map(s).filter(Boolean))];
  if (mode === "ONLINE" && !classIds.length) throw new ValidationError("Choose a class.");
  if (classIds.length > MAX_ASSIGN_CLASSES) throw new ValidationError(`Choose at most ${MAX_ASSIGN_CLASSES} classes at a time.`);
  const openAt = input.openAt ?? null, dueAt = input.dueAt ?? null;
  if (openAt && dueAt && dueAt <= openAt) throw new ValidationError("The due date must be after the start date.");
  let minutes: number | null = null;
  if (input.minutes !== null && input.minutes !== undefined && s(input.minutes) !== "") {
    minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_NAFS_MINUTES) throw new ValidationError(`The time must be 1 to ${MAX_NAFS_MINUTES} minutes.`);
  }
  const token = s(input.token).slice(0, 80);
  const key = token ? `${actor.userId}|${token}` : "";
  const seen = key ? presses.get(key) : undefined;
  if (seen) return seen.r;
  const run = withLock(`nafs-booklets:${actor.schoolId}`, async (): Promise<BookletAssignResult> => {
    const made = await ensureBookletTests(repo, actor, input.codes, now);
    const tests = made.map((m) => ({ code: m.code, testId: m.testId }));
    if (mode === "PAPER") return { mode, booklets: made.length, students: 0, classes: 0, source, tests };
    const classes: Row[] = [];
    for (const id of classIds) classes.push(await grade6Class(repo, actor, id));
    const members = await repo.findMany("ClassMembership", { classId: { in: classes.map((k) => s(k.id)) }, leftAt: null }, { select: ["classId", "studentId"], take: 5000 });
    const chosen = [...new Set((input.studentIds ?? []).map(s).filter(Boolean))];
    if (chosen.some((x) => !members.some((m) => s(m.studentId) === x))) throw new ValidationError("Choose students of this class.");
    const plan = classes.map((k) => {
      const all = members.filter((m) => s(m.classId) === s(k.id)).map((m) => s(m.studentId));
      const mine = chosen.length ? all.filter((x) => chosen.includes(x)) : null;
      return { classId: s(k.id), studentIds: mine, who: mine ?? all };
    }).filter((p) => !chosen.length || p.who.length);
    const who = [...new Set(plan.flatMap((p) => p.who))];
    const rows = await repo.findMany("NafsTest", { id: { in: tests.map((x) => x.testId) } }, { select: ["id", "settings"] });
    const given: string[] = [];
    for (const m of tests) {
      const st = json<Record<string, unknown> | null>(rows.find((r) => s(r.id) === m.testId)?.settings, null) ?? {};
      const by: Record<string, string> = { ...(st.sourceByClass && typeof st.sourceByClass === "object" ? (st.sourceByClass as Record<string, string>) : {}) };
      for (const p of plan) {
        by[p.classId] = source;
        const row = await repo.upsert("NafsTestClass", { testId: m.testId, classId: p.classId }, { openAt, dueAt, timeLimitMin: minutes, studentIds: p.studentIds, releasedAt: null, createdById: actor.userId, createdAt: now }, { openAt, dueAt, timeLimitMin: minutes, studentIds: p.studentIds });
        given.push(s(row.id));
      }
      await repo.updateMany("NafsTest", { id: m.testId }, { settings: { ...st, sourceByClass: by } });
    }
    // given again after a cancel on the Assigned page: it comes back (answers were never touched)
    if (given.length) await repo.updateMany("AssignmentCancel", { kind: "NAFS_TEST", refId: { in: given }, restoredAt: null }, { restoredAt: now, restoredById: actor.userId }).catch(() => 0);
    const st = who.length ? await repo.findMany("Student", { id: { in: who } }, { select: ["userId"] }) : [];
    const names = tests.map((x) => x.code).join(", ");
    if (st.length) await repo.createMany("Notification", st.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "New NAFS test", body: `${tests.length > 1 ? `${tests.length} NAFS booklets` : "NAFS booklet"}: ${names}.${dueAt ? ` Due ${dueAt.toISOString().slice(0, 10)}.` : ""}`, link: "/student/nafs?part=tests", createdAt: now })));
    await audit(repo, { actorId: actor.userId, action: "nafs.booklets.assign", entityType: "NafsTest", entityId: tests[0]?.testId ?? "", after: { booklets: tests.map((x) => x.code), classes: plan.map((p) => p.classId), students: who.length, chosen: chosen.length > 0, source, minutes }, at: now });
    return { mode, booklets: tests.length, students: who.length, classes: plan.length, source, tests };
  });
  if (key) remember(key, run, now.getTime());
  return run;
}

export { bookletSourceOf } from "./booklet-source";

/** The booklet's test to report on: the one with the most results in the actor's classes (null = none given yet). */
export async function bookletReportTest(repo: Repo, actor: Actor, code: string): Promise<{ testId: string | null; tests: number }> {
  await assertNafs(repo, actor);
  if (!actor.schoolId || !CODE.test(s(code))) return { testId: null, tests: 0 };
  const ids = (await bookletTests(repo, actor.schoolId)).get(code) ?? [];
  if (!ids.length) return { testId: null, tests: 0 };
  const mine = (await accessibleClasses(repo, actor)).map((c) => s(c.id));
  const rows: Row[] = mine.length ? await repo.findMany("NafsResult", { testId: { in: ids }, classId: { in: mine }, submittedAt: { not: null } }, { select: ["testId"], take: 5000 }) : [];
  const n = new Map<string, number>();
  for (const r of rows) n.set(s(r.testId), (n.get(s(r.testId)) ?? 0) + 1);
  const best = [...ids].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0))[0];
  return { testId: best ?? null, tests: ids.length };
}
