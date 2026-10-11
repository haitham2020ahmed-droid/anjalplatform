/**
 * 📊 What students' answers say about each question (Question Quality page, tabs "Alerts" and "Level changes"):
 * open alerts with the numbers, the log of automatic / approved level changes, and one question's per-grade
 * statistics. Written by the daily job (src/server/questions/reclassify.ts). School-scoped through
 * question → skill → curriculum → grade.
 */
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(s(v)).toISOString() : "");
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };

/** The school's questions' grade, for the given question ids (others are dropped). */
async function schoolQuestions(repo: Repo, schoolId: string, ids: string[]): Promise<Map<string, { stem: string; grade: number; skill: string; difficulty: number; source: string }>> {
  const out = new Map<string, { stem: string; grade: number; skill: string; difficulty: number; source: string }>();
  if (!ids.length) return out;
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const curs = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] }) : [];
  for (let i = 0; i < ids.length; i += 1000) {
    const qs = await repo.findMany("Question", { id: { in: ids.slice(i, i + 1000) } }, { select: ["id", "stem", "skillId", "difficultyLevel", "difficultySource"] });
    const skills = qs.length ? await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] }, curriculumId: { in: curs.map((c) => c.id) } }, { select: ["id", "name", "curriculumId"] }) : [];
    for (const q of qs) {
      const k = skills.find((x) => x.id === q.skillId);
      if (!k) continue;
      const c = curs.find((x) => x.id === k.curriculumId);
      out.set(s(q.id), { stem: s(q.stem), grade: Number(grades.find((g) => g.id === c?.gradeId)?.level ?? 0), skill: s(k.name), difficulty: Number(q.difficultyLevel), source: s(q.difficultySource) });
    }
  }
  return out;
}

export interface AlertRow { id: string; questionId: string; stem: string; skill: string; ownGrade: number; grade: number; kind: string; detail: string; status: string; heldBack: boolean; createdAt: string; responses: number | null; pct: number | null; discrimination: number | null; medianMs: number | null }

export async function alertList(repo: Repo, actor: Actor, opts: { status?: "OPEN" | "RESOLVED" | "DISMISSED"; grade?: number; limit?: number } = {}): Promise<AlertRow[]> {
  assertCan(actor, "questions:read");
  const rows = (await repo.findMany("QuestionAlert", { status: opts.status ?? "OPEN", ...(opts.grade ? { grade: opts.grade } : {}) }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 2000 }));
  const qs = await schoolQuestions(repo, s(actor.schoolId), [...new Set(rows.map((r) => s(r.questionId)))]);
  const mine = rows.filter((r) => qs.has(s(r.questionId))).slice(0, opts.limit ?? 300);
  const stats = mine.length ? await repo.findMany("QuestionGradeStat", { questionId: { in: [...new Set(mine.map((r) => s(r.questionId)))] } }) : [];
  return mine.map((r) => {
    const q = qs.get(s(r.questionId))!;
    const st = stats.find((x) => x.questionId === r.questionId && Number(x.grade) === Number(r.grade));
    return { id: s(r.id), questionId: s(r.questionId), stem: q.stem.slice(0, 220), skill: q.skill, ownGrade: q.grade, grade: Number(r.grade), kind: s(r.kind), detail: s(r.detail), status: s(r.status), heldBack: Boolean(r.heldBack), createdAt: iso(r.createdAt),
      responses: st ? Number(st.responses) : null, pct: st ? Number(st.pct) : null, discrimination: st?.discrimination === null || st?.discrimination === undefined ? null : Number(st.discrimination), medianMs: st?.medianMs === null || st?.medianMs === undefined ? null : Number(st.medianMs) };
  });
}

export interface LevelChangeRow { id: string; questionId: string; stem: string; grade: number; fromLevel: string; toLevel: string; fromDifficulty: number; toDifficulty: number; pct: number; responses: number; basis: string; source: string; reason: string; createdAt: string }

export async function levelChangeList(repo: Repo, actor: Actor, opts: { grade?: number; limit?: number } = {}): Promise<LevelChangeRow[]> {
  assertCan(actor, "questions:read");
  const rows = await repo.findMany("QuestionLevelChange", opts.grade ? { grade: opts.grade } : {}, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 2000 });
  const qs = await schoolQuestions(repo, s(actor.schoolId), [...new Set(rows.map((r) => s(r.questionId)))]);
  return rows.filter((r) => qs.has(s(r.questionId))).slice(0, opts.limit ?? 200).map((r) => ({
    id: s(r.id), questionId: s(r.questionId), stem: qs.get(s(r.questionId))!.stem.slice(0, 160), grade: Number(r.grade), fromLevel: s(r.fromLevel), toLevel: s(r.toLevel),
    fromDifficulty: Number(r.fromDifficulty), toDifficulty: Number(r.toDifficulty), pct: Number(r.pct), responses: Number(r.responses), basis: s(r.basis), source: s(r.source), reason: s(r.reason), createdAt: iso(r.createdAt),
  }));
}

export interface QuestionDataView {
  questionId: string; stem: string; skill: string; ownGrade: number; difficulty: number; source: string;
  grades: { grade: number; own: boolean; responses: number; pct: number; responsesOnLevel: number; pctOnLevel: number | null; discrimination: number | null; medianMs: number | null; optionShares: Record<string, number> | null; updatedAt: string }[];
  changes: LevelChangeRow[]; alerts: { id: string; grade: number; kind: string; status: string; detail: string; heldBack: boolean }[];
}

/** One question's statistics per grade (its own grade decides the level; the others are information). */
export async function questionData(repo: Repo, actor: Actor, questionId: string): Promise<QuestionDataView> {
  assertCan(actor, "questions:read");
  const q = (await schoolQuestions(repo, s(actor.schoolId), [questionId])).get(questionId);
  if (!q) throw new ForbiddenError("Not found.");
  const [stats, changes, alerts] = await Promise.all([
    repo.findMany("QuestionGradeStat", { questionId }),
    repo.findMany("QuestionLevelChange", { questionId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 50 }),
    repo.findMany("QuestionAlert", { questionId }),
  ]);
  return {
    questionId, stem: q.stem, skill: q.skill, ownGrade: q.grade, difficulty: q.difficulty, source: q.source,
    grades: stats.sort((a, b) => Number(a.grade) - Number(b.grade)).map((x: Row) => ({ grade: Number(x.grade), own: Number(x.grade) === q.grade, responses: Number(x.responses), pct: Number(x.pct), responsesOnLevel: Number(x.responsesOnLevel ?? 0), pctOnLevel: x.pctOnLevel === null || x.pctOnLevel === undefined ? null : Number(x.pctOnLevel), discrimination: x.discrimination === null || x.discrimination === undefined ? null : Number(x.discrimination), medianMs: x.medianMs === null || x.medianMs === undefined ? null : Number(x.medianMs), optionShares: json<Record<string, number> | null>(x.optionShares, null), updatedAt: iso(x.updatedAt) })),
    changes: changes.map((r) => ({ id: s(r.id), questionId, stem: "", grade: Number(r.grade), fromLevel: s(r.fromLevel), toLevel: s(r.toLevel), fromDifficulty: Number(r.fromDifficulty), toDifficulty: Number(r.toDifficulty), pct: Number(r.pct), responses: Number(r.responses), basis: s(r.basis), source: s(r.source), reason: s(r.reason), createdAt: iso(r.createdAt) })),
    alerts: alerts.map((a) => ({ id: s(a.id), grade: Number(a.grade), kind: s(a.kind), status: s(a.status), detail: s(a.detail), heldBack: Boolean(a.heldBack) })),
  };
}
