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
import { DIFFICULTY_NAME, type Difficulty } from "./framework";
import { loadNafsQuestions, nafsIndex, usable } from "./bank";
import { setChoices, MINISTRY_DEFAULT, type SetChoice } from "./build";
import { assignNafsOnline, json, saveNafsTest } from "./tests";

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

/** "Assign online": each chosen booklet to a Grade 6 class (or chosen students), its own time and dates. */
export async function assignBooklets(repo: Repo, actor: Actor, input: { codes: string[]; classId: string; studentIds?: string[] | null; minutes?: number | null; openAt?: Date | null; dueAt?: Date | null }, now = new Date()): Promise<{ booklets: number; students: number; tests: string[] }> {
  const made = await ensureBookletTests(repo, actor, input.codes, now);
  let students = 0;
  for (const m of made) students = (await assignNafsOnline(repo, actor, { testId: m.testId, classId: input.classId, studentIds: input.studentIds ?? null, timeLimitMin: input.minutes ?? null, openAt: input.openAt ?? null, dueAt: input.dueAt ?? null }, now)).students;
  return { booklets: made.length, students, tests: made.map((m) => m.testId) };
}

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
