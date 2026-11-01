/**
 * 📊 Practice and time (IXL-style) — rebuilt on the shared skill system (owner, 31 Oct 2026).
 *
 * For a class (or one student) and any date range:
 *   - ONE row per skill = the shared skill key (skills/status.ts skillKeyIndex): every copy of a skill (Grade 4 / Grade 5
 *     rows, a Curriculum Map lesson's own name, a MAP statement's skill) is one row with the same name as Student Skills
 *     and My Skills;
 *   - the stars come from SkillStatus (☆ ◐ ⭐ 🔄 — the same ones every page shows), never the old StudentSkillMastery;
 *   - every source is read and labelled:
 *       PRACTICE  skill practice / assigned sets / MAP plan / Curriculum Map sets (the sessions that count toward ⭐ —
 *                 the SAME rule as the stars: status.ts practiceSessionIds)
 *       NAFS      NAFS practice answers (NafsPracticeAnswer; they count toward ⭐ too)
 *       READRISE  ReadRise article questions (SkillEvidence READRISE; they count toward ⭐ too; no per-question time)
 *       TESTS     tests, Weekly Checks, review checks, Diagnostic, placement, quizzes (never ⭐)
 *       OTHER     Learn lessons and their checks, class activities, "Review my mistakes", ReadMaster (never ⭐)
 *     Live games are never counted (owner rule: games never change levels, stars or scores).
 *   - the default view is "practice" = PRACTICE + NAFS + READRISE (what builds the stars); the teacher can switch to
 *     tests, other activities or everything. The source breakdown is always shown in full.
 *   - questions on the hidden Curriculum Map holder skill (map questions not linked to a skill yet) are ONE separate
 *     line ("not linked to a skill yet"), never a skill row.
 * Days are Riyadh days (UTC+3); at school = Sunday–Thursday 07:00–14:00 Riyadh time.
 * Time: each timed answer counts at most 5 minutes (a student who left the page is not "working" for an hour);
 * ReadRise answers have no per-question time and are counted as "not timed".
 * Accuracy counts careful answers only (a rapid guess counts for nothing); effort = careful answers / all answers;
 * a session with over 20 % rapid guesses is Unreliable (teacher-only).
 * Reads are batched by 200 students and select only the columns used (512 MB server).
 */
import { isRapidGuess, sessionEffort } from "../practice/guessing";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { displayScore, practiceSessionIds, skillKeyIndex, skillStatusesFor, type StarStatus, type StarView } from "../skills/status";
import { isHiddenSkill } from "../skills/master";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const MAX_MS = 5 * 60_000;
const RIYADH = 3 * 3_600_000;
const CHUNK = 200;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const mins = (ms: number) => Math.round(ms / 60_000);

/** School time: Sunday–Thursday, 07:00–14:00 in Riyadh. */
export function atSchool(at: Date | string | number): boolean {
  const d = new Date(new Date(at).getTime() + RIYADH);
  const day = d.getUTCDay(), h = d.getUTCHours();
  return day >= 0 && day <= 4 && h >= 7 && h < 14;
}
export const riyadhDay = (at: Date | string | number) => new Date(new Date(at).getTime() + RIYADH).toISOString().slice(0, 10);
/** A calendar day range (UTC midnight dates, as periods.ts gives them) → the same days in Riyadh time. */
export function riyadhRange(from: Date, to: Date): { from: Date; to: Date } {
  return { from: new Date(from.getTime() - RIYADH), to: new Date(to.getTime() - RIYADH) };
}

/** where an answer came from */
export type AnswerSource = "PRACTICE" | "NAFS" | "READRISE" | "TESTS" | "OTHER";
/** what the report shows: practice (counts toward ⭐, the default), tests, other activities, or everything */
export type PracticeView = "practice" | "tests" | "other" | "all";
export const SOURCE_LABEL: Record<AnswerSource, string> = {
  PRACTICE: "Skill practice", NAFS: "NAFS practice", READRISE: "ReadRise questions", TESTS: "Tests & checks", OTHER: "Lessons, ReadMaster & reviews",
};
/** the sources that count toward ⭐ */
export const STAR_SOURCES: readonly AnswerSource[] = ["PRACTICE", "NAFS", "READRISE"];
const VIEW_SOURCES: Record<PracticeView, readonly AnswerSource[]> = {
  practice: STAR_SOURCES, tests: ["TESTS"], other: ["OTHER"], all: ["PRACTICE", "NAFS", "READRISE", "TESTS", "OTHER"],
};

/** one answer, whatever table it lives in */
interface Answer { studentId: string; skillId: string; questionId: string | null; correct: boolean; ms: number | null; at: number; source: AnswerSource; rapid: boolean; session: string }

export interface StarCounts { mastered: number; inProgress: number; needsReview: number; notStarted: number }
export interface SkillUse {
  /** the shared skill key (one row per skill, as in Student Skills) */
  key: string;
  /** a skill row practised under this key (links that need a row id) */
  skillId: string;
  name: string; questions: number; correct: number; accuracy: number | null; minutes: number; students: number; effort: number | null;
  /** the stars NOW of the students who practised it in the range */
  stars: StarCounts;
  /** answers by source (in the current view) */
  bySource: Partial<Record<AnswerSource, number>>;
}
export interface StudentSkill {
  key: string; skillId: string; name: string; questions: number; minutes: number; accuracy: number | null; change: number | null; effort: number | null;
  /** the star now (SkillStatus) */
  status: StarStatus; score: number; answered: number; mastered: boolean; masteredInRange: boolean; needsSupport: boolean;
}
export interface StudentUse {
  id: string; name: string; questions: number; minutes: number; accuracy: number | null; skills: number; effort: number | null; unreliable: number;
  /** stars now over ALL the student's skills (the same counts as My Skills) */
  stars: StarCounts;
  /** ⭐ earned inside the range */
  newStars: number;
  schoolPct: number | null; lastActive: string | null; detail: StudentSkill[];
}
export interface SessionUse { id: string; day: string; skill: string; source: AnswerSource; answers: number; effort: number | null; unreliable: boolean }
export interface DayUse { day: string; questions: number; school: number; home: number; minutes: number }
export interface PracticeAnalytics {
  scope: { classId: string; className: string; studentId: string | null; view: PracticeView }; from: string; to: string;
  totals: {
    questions: number; correct: number; accuracy: number | null; minutes: number; untimed: number; activeStudents: number; students: number; skills: number;
    /** ⭐ earned in the range (the students' stars with masteredAt inside it) */
    newStars: number;
    /** stars now, over the skills practised in the range (each student × skill once) */
    stars: StarCounts;
    schoolQuestions: number; homeQuestions: number; avgPerStudent: number | null; effort: number | null; unreliable: number;
  };
  /** every answer in the range by source — always all sources, whatever the view */
  sources: { source: AnswerSource; label: string; questions: number; students: number; countsForStars: boolean }[];
  /** answers on Curriculum Map questions that are not linked to a skill yet (shown apart, never a skill row) */
  unlinked: { questions: number; students: number };
  days: DayUse[]; skills: SkillUse[]; students: StudentUse[];
  /** the one-student view: the student's sessions in the range, newest first (at most 40) */
  sessions: SessionUse[];
  trouble: { questionId: string; stem: string; skill: string; key: string; missedBy: number; tried: number }[];
}

const emptyStars = (): StarCounts => ({ mastered: 0, inProgress: 0, needsReview: 0, notStarted: 0 });
const isMastered = (v: StarView | undefined) => v?.status === "MASTERED" || v?.status === "NEXT_LEVEL";
function addStar(c: StarCounts, v: StarView | undefined): void {
  if (isMastered(v)) c.mastered++;
  else if (v?.status === "NEEDS_REVIEW") c.needsReview++;
  else if (v?.status === "IN_PROGRESS") c.inProgress++;
  else c.notStarted++;
}

/** Every answer of these students in the range, from every table, labelled by source (batched). */
export async function loadAnswers(repo: Repo, ids: string[], fromD: Date, toD: Date): Promise<Answer[]> {
  const out: Answer[] = [];
  const range = { gte: fromD, lte: toD };
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const [qa, nafs, rr] = await Promise.all([
      repo.findMany("QuestionAttempt", { studentId: { in: part }, createdAt: range }, { select: ["studentId", "questionId", "skillId", "isCorrect", "responseMs", "createdAt", "rapidGuess", "sessionId", "source"] }),
      repo.findMany("NafsPracticeAnswer", { studentId: { in: part }, at: range }, { select: ["studentId", "questionId", "runId", "correct", "ms", "at"] }).catch(() => [] as Row[]),
      repo.findMany("SkillEvidence", { studentId: { in: part }, source: "READRISE", createdAt: range }, { select: ["studentId", "skillId", "refId", "credit", "createdAt"] }).catch(() => [] as Row[]),
    ]);
    // bank answers: skill practice (counts toward ⭐) vs tests and checks vs lessons / ReadMaster / reviews
    const practice = await practiceSessionIds(repo, qa.filter((r) => !s(r.source)).map((r) => s(r.sessionId)));
    for (const r of qa) {
      const src: AnswerSource = s(r.source) ? "OTHER" : practice.has(s(r.sessionId)) ? "PRACTICE" : "TESTS";
      out.push({ studentId: s(r.studentId), skillId: s(r.skillId), questionId: s(r.questionId), correct: Boolean(r.isCorrect), ms: Math.min(MAX_MS, Math.max(0, Number(r.responseMs) || 0)), at: t(r.createdAt), source: src, rapid: Boolean(r.rapidGuess), session: s(r.sessionId) });
    }
    // NAFS practice: each answer is a platform question; its skill is the question's skill
    if (nafs.length) {
      const qids = [...new Set(nafs.map((r) => s(r.questionId)))];
      const skillOfQ = new Map<string, string>();
      for (let j = 0; j < qids.length; j += 500) for (const q of await repo.findMany("Question", { id: { in: qids.slice(j, j + 500) } }, { select: ["id", "skillId"] })) skillOfQ.set(s(q.id), s(q.skillId));
      for (const r of nafs) {
        const sk = skillOfQ.get(s(r.questionId));
        if (!sk) continue;
        const raw = Math.max(0, Number(r.ms) || 0);
        out.push({ studentId: s(r.studentId), skillId: sk, questionId: s(r.questionId), correct: Boolean(r.correct), ms: Math.min(MAX_MS, raw), at: t(r.at), source: "NAFS", rapid: isRapidGuess(raw), session: `nafs:${s(r.runId)}` });
      }
    }
    // ReadRise: careful answers of reliable runs only are saved (no per-question time, no question id)
    for (const r of rr) out.push({ studentId: s(r.studentId), skillId: s(r.skillId), questionId: null, correct: Number(r.credit) >= 1, ms: null, at: t(r.createdAt), source: "READRISE", rapid: false, session: `readrise:${s(r.refId).split(":")[0]}` });
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function practiceAnalytics(repo: Repo, actor: Actor, input: { classId: string; from: Date; to: Date; studentId?: string | null; view?: PracticeView }): Promise<PracticeAnalytics> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => c.id === input.classId);
  if (!klass) throw new ForbiddenError("Class not found.");
  const view: PracticeView = input.view && VIEW_SOURCES[input.view] ? input.view : "practice";
  let ids = await classMembers(repo, input.classId);
  if (input.studentId) { if (!ids.includes(input.studentId)) throw new ForbiddenError("This student is not in the class."); ids = [input.studentId]; }
  const from = input.from.getTime(), to = input.to.getTime();
  const schoolId = s(klass.schoolId) || s(actor.schoolId);

  const [names, all, ix] = await Promise.all([studentNames(repo, ids), ids.length ? loadAnswers(repo, ids, input.from, input.to) : Promise.resolve([] as Answer[]), skillKeyIndex(repo, schoolId)]);
  const inRangeAll = all.filter((a) => a.at >= from && a.at <= to);

  // the hidden Curriculum Map holder skill: those answers are ONE separate line, never a skill row
  const skillIdsSeen = [...new Set(inRangeAll.map((a) => a.skillId).filter(Boolean))];
  const codes = new Map<string, string>();
  for (let i = 0; i < skillIdsSeen.length; i += 500) for (const k of await repo.findMany("Skill", { id: { in: skillIdsSeen.slice(i, i + 500) } }, { select: ["id", "code", "name"] })) codes.set(s(k.id), s(k.code));
  const hidden = (id: string) => isHiddenSkill(codes.get(id));
  const keyOf = (id: string) => ix.keyOf.get(id) ?? `skill:${id}`;
  const nameOfKey = new Map<string, string>();
  const nameOf = (key: string, id: string) => {
    if (!nameOfKey.has(key)) nameOfKey.set(key, ix.nameOf.get(key) ?? "Skill");
    return nameOfKey.get(key) || id;
  };

  // the source breakdown (always every source) and the unlinked line
  const sources = (["PRACTICE", "NAFS", "READRISE", "TESTS", "OTHER"] as AnswerSource[]).map((src) => {
    const list = inRangeAll.filter((a) => a.source === src && !hidden(a.skillId));
    return { source: src, label: SOURCE_LABEL[src], questions: list.length, students: new Set(list.map((a) => a.studentId)).size, countsForStars: STAR_SOURCES.includes(src) };
  });
  const unl = inRangeAll.filter((a) => hidden(a.skillId) && VIEW_SOURCES[view].includes(a.source));
  const unlinked = { questions: unl.length, students: new Set(unl.map((a) => a.studentId)).size };

  // the view
  const rows = inRangeAll.filter((a) => VIEW_SOURCES[view].includes(a.source) && a.skillId && !hidden(a.skillId));
  const careful = (list: Answer[]) => list.filter((r) => !r.rapid);
  const accOf = (list: Answer[]) => { const c = careful(list); return pct(c.filter((r) => r.correct).length, c.length); };
  const effortOf = (list: Answer[]) => sessionEffort(list.map((r) => ({ rapidGuess: r.rapid }))).effort;
  const timeOf = (list: Answer[]) => mins(list.reduce((x, r) => x + (r.ms ?? 0), 0));

  // stars now (SkillStatus): every key of the students (for their totals) — one batched read
  const keysPractised = [...new Set(rows.map((r) => keyOf(r.skillId)))];
  const stars = ids.length ? await skillStatusesFor(repo, ids) : new Map<string, Map<string, StarView>>();
  const starOf = (sid: string, key: string): StarView | undefined => stars.get(sid)?.get(key);
  const masteredIn = (v: StarView | undefined) => isMastered(v) && v!.masteredAt !== null && t(v!.masteredAt) >= from && t(v!.masteredAt) <= to;

  // sessions (Unreliable = over 20 % rapid guesses), per student
  const bySession = new Map<string, Answer[]>();
  for (const r of rows) { if (r.source === "READRISE") continue; const k = `${r.studentId}|${r.session}`; const l = bySession.get(k); if (l) l.push(r); else bySession.set(k, [r]); }
  const unreliableOf = new Map<string, number>();
  for (const list of bySession.values()) if (sessionEffort(list.map((r) => ({ rapidGuess: r.rapid }))).unreliable) unreliableOf.set(list[0].studentId, (unreliableOf.get(list[0].studentId) ?? 0) + 1);

  // by day (Riyadh days)
  const dayMap = new Map<string, DayUse>();
  for (const r of rows) {
    const k = riyadhDay(r.at);
    const d = dayMap.get(k) ?? { day: k, questions: 0, school: 0, home: 0, minutes: 0 };
    d.questions++; if (atSchool(r.at)) d.school++; else d.home++; d.minutes += (r.ms ?? 0) / 60_000;
    dayMap.set(k, d);
  }
  const days = [...dayMap.values()].map((d) => ({ ...d, minutes: Math.round(d.minutes) })).sort((a, b) => a.day.localeCompare(b.day));

  // group once: key → answers, student → answers, student|key → answers
  const byKey = new Map<string, Answer[]>(), byStudent = new Map<string, Answer[]>(), byPair = new Map<string, Answer[]>();
  const push = (m: Map<string, Answer[]>, k: string, r: Answer) => { const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); };
  for (const r of rows) { const k = keyOf(r.skillId); push(byKey, k, r); push(byStudent, r.studentId, r); push(byPair, `${r.studentId}|${k}`, r); }

  // by skill (one row per shared skill)
  const skills: SkillUse[] = [...byKey].map(([key, list]) => {
    const who = [...new Set(list.map((r) => r.studentId))];
    const st = emptyStars(); for (const sid of who) addStar(st, starOf(sid, key));
    const bySource: Partial<Record<AnswerSource, number>> = {};
    for (const r of list) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    return { key, skillId: list[0].skillId, name: nameOf(key, list[0].skillId), questions: list.length, correct: careful(list).filter((r) => r.correct).length, accuracy: accOf(list), minutes: timeOf(list), students: who.length, effort: effortOf(list), stars: st, bySource };
  }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));

  // per student (and each skill they practised)
  const students: StudentUse[] = ids.map((id) => {
    const mine = byStudent.get(id) ?? [];
    const keys = [...new Set(mine.map((r) => keyOf(r.skillId)))];
    const detail: StudentSkill[] = keys.map((key) => {
      const a = byPair.get(`${id}|${key}`) ?? [], v = starOf(id, key);
      const c = careful(a), first = c.slice(0, 5), last = c.slice(-5);
      const change = c.length >= 6 ? pct(last.filter((r) => r.correct).length, last.length)! - pct(first.filter((r) => r.correct).length, first.length)! : null;
      return {
        key, skillId: a[0].skillId, name: nameOf(key, a[0].skillId), questions: a.length, minutes: timeOf(a), accuracy: accOf(a), change, effort: effortOf(a),
        status: v?.status ?? "NOT_STARTED", score: v ? displayScore(v.score, v.answered) : 0, answered: v?.answered ?? 0, mastered: isMastered(v), masteredInRange: masteredIn(v), needsSupport: Boolean(v?.needsSupport),
      };
    }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));
    const all = stars.get(id) ?? new Map<string, StarView>();
    const st = emptyStars(); let fresh = 0;
    for (const v of all.values()) { if (v.status === "NOT_STARTED") continue; addStar(st, v); if (masteredIn(v)) fresh++; }
    const last = mine.length ? riyadhDay(mine[mine.length - 1].at) : null;
    return {
      id, name: names.get(id)?.name ?? "Student", questions: mine.length, minutes: timeOf(mine), accuracy: accOf(mine), skills: keys.length, effort: effortOf(mine), unreliable: unreliableOf.get(id) ?? 0,
      stars: st, newStars: fresh, schoolPct: pct(mine.filter((r) => atSchool(r.at)).length, mine.length), lastActive: last, detail,
    };
  }).sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));

  // trouble spots: questions missed by the most students (2+), careful answers only
  const byQ = new Map<string, { wrong: Set<string>; tried: Set<string>; skillId: string }>();
  for (const r of careful(rows)) {
    if (!r.questionId) continue;
    const q = byQ.get(r.questionId) ?? { wrong: new Set<string>(), tried: new Set<string>(), skillId: r.skillId };
    q.tried.add(r.studentId); if (!r.correct) q.wrong.add(r.studentId); byQ.set(r.questionId, q);
  }
  const hard = [...byQ].filter(([, q]) => q.wrong.size >= 2).sort((a, b) => b[1].wrong.size - a[1].wrong.size || b[1].tried.size - a[1].tried.size).slice(0, 8);
  const stems = hard.length ? await repo.findMany("Question", { id: { in: hard.map(([id]) => id) } }, { select: ["id", "stem"] }) : [];
  const trouble = hard.map(([id, q]) => ({ questionId: id, stem: s(stems.find((x) => s(x.id) === id)?.stem).replace(/\s+/g, " ").slice(0, 160), skill: nameOf(keyOf(q.skillId), q.skillId), key: keyOf(q.skillId), missedBy: q.wrong.size, tried: q.tried.size }));

  // the one-student view: sessions
  const sessions: SessionUse[] = input.studentId ? [...bySession.values()].sort((a, b) => b[0].at - a[0].at).slice(0, 40).map((list) => {
    const e = sessionEffort(list.map((r) => ({ rapidGuess: r.rapid }))), here = [...new Set(list.map((r) => nameOf(keyOf(r.skillId), r.skillId)))];
    return { id: list[0].session, day: riyadhDay(list[0].at), skill: here.slice(0, 2).join(", ") + (here.length > 2 ? " +" : ""), source: list[0].source, answers: e.answers, effort: e.effort, unreliable: e.unreliable };
  }) : [];

  // totals: stars over the skills practised (each student × skill once), ⭐ earned in the range over all skills
  const totStars = emptyStars();
  for (const [pair] of byPair) { const [sid, key] = pair.split("|"); addStar(totStars, starOf(sid, key)); }
  const active = students.filter((x) => x.questions > 0).length;
  const school = rows.filter((r) => atSchool(r.at)).length;
  return {
    scope: { classId: input.classId, className: s(klass.name), studentId: input.studentId ?? null, view },
    from: riyadhDay(from), to: riyadhDay(to),
    totals: {
      questions: rows.length, correct: careful(rows).filter((r) => r.correct).length, accuracy: accOf(rows), minutes: timeOf(rows), untimed: rows.filter((r) => r.ms === null).length,
      activeStudents: active, students: ids.length, skills: keysPractised.length, newStars: students.reduce((x, st) => x + st.newStars, 0), stars: totStars,
      schoolQuestions: school, homeQuestions: rows.length - school, avgPerStudent: active ? Math.round(rows.length / active) : null,
      effort: effortOf(rows), unreliable: [...unreliableOf.values()].reduce((a, b) => a + b, 0),
    },
    sources, unlinked, days, skills, students, trouble, sessions,
  };
}
