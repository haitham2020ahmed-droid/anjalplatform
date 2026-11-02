/**
 * 🎯 Answer-length check (Admin → Questions): how often the CORRECT choice is the longest one in the school's live
 * multiple-choice questions (chance with 4 choices = 25 %), by source and by skill (worst first), and the questions the
 * length clue flags (src/lib/length-cue.ts: sentence-like choices, the correct one the unique longest and > 1.15 × the
 * next). Sources: the bank questions (Question + QuestionOption: Question Bank, Curriculum Map, NAFS, ReadMaster) and
 * the ReadRise articles' questions (RRQuestion). Learn lessons and the ReadRise placement test are read from the data
 * files at run time (not in the database) and are checked there.
 *
 * Bounded: questions are read in pages of 500 ids (id + skill only), their choices one query per page (question id,
 * text, isCorrect, order). The figures and the flagged list (ids + ratio only, no text) are kept ~10 minutes while the
 * tables are unchanged (keptWhileUnchanged); a page of flagged questions and the export read their texts in pages.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { BANK_MODELS, keptWhileUnchanged } from "../cache/kept";
import { schoolSkillIndex } from "../questions/skill-questions";
import { lengthCue } from "../../lib/length-cue";
import { bankSources, SOURCE_LABEL, type RewriteSource } from "./option-rewrites";

const s = (v: unknown) => String(v ?? "");
const PAGE = 500;
export const KEEP_MS = 10 * 60_000;
export const FLAGGED_PAGE = 25;
/** at most this many flagged questions are kept / exported (the bank holds ~10,000 multiple-choice questions) */
export const FLAGGED_MAX = 20_000;

export interface LengthTally { checked: number; longest: number; pct: number; flagged: number }
export interface FlaggedRef { id: string; source: RewriteSource; ratio: number; skill: string }
export interface AnswerLengthReport {
  overall: LengthTally;
  bySource: (LengthTally & { source: RewriteSource; label: string })[];
  bySkill: (LengthTally & { skill: string; source: RewriteSource })[];
  flagged: FlaggedRef[];
  at: string;
}

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const isTrue = (v: unknown) => v === true || v === 1 || v === "1";

/** Pure: tallies one question into a group. */
function count(m: Map<string, LengthTally>, key: string, longest: boolean, flagged: boolean): void {
  const t = m.get(key) ?? m.set(key, { checked: 0, longest: 0, pct: 0, flagged: 0 }).get(key)!;
  t.checked++; if (longest) t.longest++; if (flagged) t.flagged++;
}

const optArray = (v: unknown): string[] => {
  let x = v;
  if (typeof x === "string") { try { x = JSON.parse(x); } catch { return []; } }
  return Array.isArray(x) ? x.map(s) : [];
};

async function compute(repo: Repo, schoolId: string): Promise<AnswerLengthReport> {
  const all = new Map<string, LengthTally>(), bySrc = new Map<string, LengthTally>(), bySkill = new Map<string, LengthTally>();
  const skillSrc = new Map<string, RewriteSource>();
  const flagged: FlaggedRef[] = [];
  const take = (src: RewriteSource, skill: string, id: string, options: string[], correctIndex: number) => {
    const cue = lengthCue(options, correctIndex);
    count(all, "", cue.longest, cue.flagged); count(bySrc, src, cue.longest, cue.flagged);
    const sk = `${src}|${skill}`; count(bySkill, sk, cue.longest, cue.flagged); skillSrc.set(sk, src);
    if (cue.flagged && flagged.length < FLAGGED_MAX) flagged.push({ id, source: src, ratio: cue.ratio, skill });
  };

  // the bank questions (published, shared — not deleted, not a teacher's private copy)
  const sidx = await schoolSkillIndex(repo, schoolId);
  const skillIds = [...sidx.ids];
  let after: string | null = null;
  while (skillIds.length) {
    const page: Row[] = await repo.findMany("Question", { skillId: { in: skillIds }, deletedAt: null, status: "PUBLISHED", privateToId: null, ...(after ? { id: { gt: after } } : {}) }, { select: ["id", "skillId"], orderBy: [{ field: "id", dir: "asc" }], take: PAGE });
    if (!page.length) break;
    after = s(page[page.length - 1].id);
    const ids = page.map((q) => s(q.id));
    const opts = await repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "text", "isCorrect", "order"] });
    const byQ = new Map<string, Row[]>();
    for (const o of opts) (byQ.get(s(o.questionId)) ?? byQ.set(s(o.questionId), []).get(s(o.questionId))!).push(o);
    // every multiple-choice kind: 3+ choices and exactly one correct
    const mc = page.filter((q) => { const os = byQ.get(s(q.id)) ?? []; return os.length >= 3 && os.filter((o) => isTrue(o.isCorrect)).length === 1; });
    const src = mc.length ? await bankSources(repo, schoolId, mc.map((q) => s(q.id))) : new Map<string, RewriteSource>();
    for (const q of mc) {
      const os = byQ.get(s(q.id))!.sort((a, b) => Number(a.order) - Number(b.order));
      take(src.get(s(q.id)) ?? "BANK", sidx.skillOf.get(s(q.skillId))?.name ?? "—", s(q.id), os.map((o) => s(o.text)), os.findIndex((o) => isTrue(o.isCorrect)));
    }
    if (page.length < PAGE) break;
  }

  // ReadRise: the published articles of the platform library and the school's own
  const arts = [
    ...(await repo.findMany("RRArticle", { schoolId: null, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })),
    ...(await repo.findMany("RRArticle", { schoolId, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })),
  ].map((a) => s(a.id));
  after = null;
  while (arts.length) {
    const page: Row[] = await repo.findMany("RRQuestion", { articleId: { in: arts }, ...(after ? { id: { gt: after } } : {}) }, { select: ["id", "options", "answer", "skill"], orderBy: [{ field: "id", dir: "asc" }], take: PAGE });
    if (!page.length) break;
    after = s(page[page.length - 1].id);
    for (const q of page) {
      const options = optArray(q.options);
      const k = "ABCD".indexOf(s(q.answer).toUpperCase());
      if (options.length >= 3 && k >= 0 && k < options.length) take("READRISE", s(q.skill) || "—", s(q.id), options, k);
    }
    if (page.length < PAGE) break;
  }

  const fin = (t: LengthTally): LengthTally => ({ ...t, pct: pct(t.longest, t.checked) });
  const overall = fin(all.get("") ?? { checked: 0, longest: 0, pct: 0, flagged: 0 });
  const bySource = [...bySrc].map(([k, t]) => ({ ...fin(t), source: k as RewriteSource, label: SOURCE_LABEL[k as RewriteSource] })).sort((a, b) => b.pct - a.pct || b.checked - a.checked);
  const skills = [...bySkill].map(([k, t]) => ({ ...fin(t), skill: k.slice(k.indexOf("|") + 1), source: skillSrc.get(k)! }))
    .sort((a, b) => b.pct - a.pct || b.flagged - a.flagged || b.checked - a.checked);
  flagged.sort((a, b) => b.ratio - a.ratio);
  return { overall, bySource, bySkill: skills, flagged, at: new Date().toISOString() };
}

/** The school's figures (kept ~10 min while the question tables are unchanged). */
export async function answerLengthReport(repo: Repo, actor: Actor): Promise<AnswerLengthReport> {
  assertCan(actor, "questions:read");
  const schoolId = s(actor.schoolId);
  return keptWhileUnchanged(repo, `answer-length:${schoolId}`, [...BANK_MODELS, "RRQuestion", "RRArticle", "NafsBankItem", "ReadMasterQuestion"], KEEP_MS, () => compute(repo, schoolId));
}

export interface FlaggedDetail { id: string; source: RewriteSource; skill: string; ratio: number; stem: string; options: string[]; correct: number; editHref: string | null }

/** The texts of some flagged questions (≤ 500 a call). */
export async function flaggedDetails(repo: Repo, refs: readonly FlaggedRef[]): Promise<FlaggedDetail[]> {
  const bank = refs.filter((r) => r.source !== "READRISE").map((r) => r.id).slice(0, 500);
  const rr = refs.filter((r) => r.source === "READRISE").map((r) => r.id).slice(0, 500);
  const [qs, opts, rqs] = await Promise.all([
    bank.length ? repo.findMany("Question", { id: { in: bank } }, { select: ["id", "stem"] }) : Promise.resolve([] as Row[]),
    bank.length ? repo.findMany("QuestionOption", { questionId: { in: bank } }, { select: ["questionId", "text", "isCorrect", "order"] }) : Promise.resolve([] as Row[]),
    rr.length ? repo.findMany("RRQuestion", { id: { in: rr } }, { select: ["id", "articleId", "stem", "options", "answer"] }) : Promise.resolve([] as Row[]),
  ]);
  const stemOf = new Map(qs.map((q) => [s(q.id), s(q.stem)]));
  const optsOf = new Map<string, Row[]>();
  for (const o of opts) (optsOf.get(s(o.questionId)) ?? optsOf.set(s(o.questionId), []).get(s(o.questionId))!).push(o);
  const rrOf = new Map(rqs.map((q) => [s(q.id), q]));
  const out: FlaggedDetail[] = [];
  for (const r of refs) {
    if (r.source === "READRISE") {
      const q = rrOf.get(r.id); if (!q) continue;
      out.push({ ...r, stem: s(q.stem), options: optArray(q.options), correct: "ABCD".indexOf(s(q.answer).toUpperCase()), editHref: `/admin/readrise/${s(q.articleId)}` });
    } else {
      if (!stemOf.has(r.id)) continue;
      const os = (optsOf.get(r.id) ?? []).sort((a, b) => Number(a.order) - Number(b.order));
      out.push({ ...r, stem: stemOf.get(r.id)!, options: os.map((o) => s(o.text)), correct: os.findIndex((o) => isTrue(o.isCorrect)), editHref: `/admin/questions/${r.id}` });
    }
  }
  return out;
}

/** "Export flagged (JSON)": { id, source, stem, options[], correct } rows (correct = the correct choice's text). */
export async function exportFlagged(repo: Repo, actor: Actor): Promise<{ id: string; source: string; stem: string; options: string[]; correct: string }[]> {
  const rep = await answerLengthReport(repo, actor);
  const out: { id: string; source: string; stem: string; options: string[]; correct: string }[] = [];
  for (let i = 0; i < rep.flagged.length; i += PAGE) {
    for (const d of await flaggedDetails(repo, rep.flagged.slice(i, i + PAGE))) out.push({ id: d.id, source: SOURCE_LABEL[d.source], stem: d.stem, options: d.options, correct: d.options[d.correct] ?? "" });
  }
  return out;
}
