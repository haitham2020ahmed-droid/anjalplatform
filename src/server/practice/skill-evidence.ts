/**
 * 🔗 Closing the loop (Update 39B, readiness 4D): every activity that measures a skill feeds that skill's mastery
 * through the SAME engine (EAP ability with the item format's guessing floor → computeMastery), each with a weight
 * and a source tag, never counted twice.
 *
 *   bank questions answered outside practice (ReadMaster articles, live games) → real QuestionAttempt rows through
 *     recordEngineAttempt (source READMASTER / GAME; both weigh 0.5 — a game is timed and fast, ReadMaster has no
 *     per-question time so a rapid guess cannot be seen; rapid guesses weigh 0)
 *   activities without bank questions → SkillEvidence rows (unique per student + source + item), merged into the
 *     skill's answer history wherever the engine reads it:
 *       READRISE  each article question → its skill (RR_SKILL_MAP), weight 0.5, chance floor 0.25 (4 options),
 *                 difficulty = the article version against the grade's On-level band; an item far easier than the
 *                 student's current ability counts half again (easy LOW-band questions cannot inflate a level);
 *                 a run read in under 45 s is a rapid run and is left out
 *       VOCAB     word review (meaning of a looked-up word, shown in its context sentence) → the grade's
 *                 Concept Vocabulary skill, else its Context Clues skill, weight 0.3
 *       WRITING   the teacher's rubric score (only after grading) → the genre's writing skill, weight 0.4; the
 *                 conventions trait → Capitalization, weight 0.3
 *       RTR       Respond to Reading marked by the teacher (0–4) → Cite Text Evidence, weight 0.5
 * External evidence never counts toward a skill's answer total (reports count saved answers), and never satisfies the
 * "independent level-5 answer" gate for Mastered (its weight is under 1).
 */
import type { Repo, Row } from "../seeding/repo";
import type { ResponseEvidence } from "../../types/domain";
import { markRepeats, toWeighted } from "../../adaptive/evidence";
import { estimateAbilityEAP } from "../../adaptive/irt";
import { computeMastery } from "../../mastery/mastery";
import { resolveEngineConfig, type AdaptiveConfig, type MasteryThresholds } from "../../config/engine";
import type { PracticeItem } from "./items";
import { log } from "../monitoring/log";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v));

export type EvidenceSource = "READRISE" | "VOCAB" | "WRITING" | "RTR";
/** evidence weight by activity (bank-question sources are in level-evidence.ts SOURCE_WEIGHT) */
export const SKILL_EVIDENCE_WEIGHT: Record<EvidenceSource, number> = { READRISE: 0.5, VOCAB: 0.3, WRITING: 0.4, RTR: 0.5 };
/** weight of an answer on a bank question by its QuestionAttempt.source */
export const ATTEMPT_SOURCE_WEIGHT: Record<string, number> = { GAME: 0.5, READMASTER: 0.5 };   // ReadMaster: since Update 39C the page sends per-question times, so rapid guesses weigh 0 there too; older answers carry the item's expected time
/** ReadRise question kind (RRQuestion.skill) → skill families of the grade's curriculum, first match wins */
export const RR_SKILL_MAP: Record<string, string[]> = {
  "main-idea": ["central-idea", "main-idea", "summarize"],
  "central-idea": ["central-idea", "main-idea", "summarize"],
  detail: ["text-evidence", "central-idea"],
  "text-evidence": ["text-evidence"],
  inference: ["inference"],
  vocabulary: ["context-clues", "greek-latin-roots"],
  "author-purpose": ["author-purpose"],
  "cause-effect": ["cause-effect"],
  compare: ["compare-contrast", "compare-texts"],
  sequence: ["sequence", "plot-events"],
  "text-structure": ["text-structure", "problem-solution", "cause-effect", "compare-contrast", "sequence"],
};
/** a ReadRise run read faster than this is a rapid run (its answers are left out) */
export const RR_MIN_READ_SECONDS = 45;
/** ReadRise Level points per logit when a ReadRise version is placed on the grade scale (≈ one grade ≈ 0.75 logit) */
export const RR_POINTS_PER_LOGIT = 190;

const levelOfB = (b: number) => Math.max(1, Math.min(7, Math.round(4 + b / 0.75)));

/** Skill families of the student's own grade curriculum: family ("inference") → skill id. */
export async function gradeSkillFamilies(repo: Repo, studentId: string): Promise<{ grade: number; family: Map<string, string>; byName: Row[] }> {
  const st = await repo.findUnique("Student", { id: studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  const cur = g ? (await repo.findMany("Curriculum", { gradeId: g.id, isActive: true }))[0] : null;
  const skills = cur ? await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "code", "name", "isActive"] }) : [];
  const family = new Map<string, string>();
  for (const k of skills) { if (k.isActive === false) continue; const m = s(k.code).toLowerCase().match(/^g\d+\.([a-z0-9-]+)$/); if (m && !family.has(m[1])) family.set(m[1], s(k.id)); }
  return { grade: Number(g?.level ?? 0), family, byName: skills };
}
export const firstFamily = (fam: Map<string, string>, list: string[] | undefined) => (list ?? []).map((f) => fam.get(f)).find(Boolean) ?? null;

/**
 * The skill's answer history for the engine (oldest first, the last `window`): bank answers (QuestionAttempt, with
 * their source weight) merged with the skill's SkillEvidence rows.
 */
export async function skillHistoryWithEvidence(repo: Repo, studentId: string, skillId: string, items: Map<string, PracticeItem>, window = 60): Promise<ResponseEvidence[]> {
  const [rows, ext] = await Promise.all([
    repo.findMany("QuestionAttempt", { studentId, skillId }, {
      select: ["questionId", "isCorrect", "partialCredit", "difficultyB", "responseMs", "usedHint", "createdAt", "source"],
      orderBy: [{ field: "createdAt", dir: "desc" }, { field: "id", dir: "desc" }], take: window,
    }),
    repo.findMany("SkillEvidence", { studentId, skillId }, { select: ["source", "refId", "credit", "difficultyB", "guessC", "weight", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: window }),
  ]);
  const bank = markRepeats(rows.reverse().map((r) => {
    const it = items.get(s(r.questionId));
    const w = ATTEMPT_SOURCE_WEIGHT[s(r.source)];
    return {
      itemId: s(r.questionId), correct: Boolean(r.isCorrect), credit: r.partialCredit === null || r.partialCredit === undefined ? undefined : Number(r.partialCredit),
      level: it?.level ?? 4, a: it?.irt.a ?? 1, b: Number(r.difficultyB), c: it?.irt.c ?? 0,
      responseMs: Number(r.responseMs), estimatedSeconds: it?.estimatedSeconds ?? 45, usedHint: Boolean(r.usedHint), at: d(r.createdAt).toISOString(),
      ...(w !== undefined ? { sourceWeight: w } : {}), ...(r.source ? { source: s(r.source) } : {}),
    } as ResponseEvidence;
  }));
  const outside: ResponseEvidence[] = ext.reverse().map((r) => ({
    itemId: `ext:${s(r.source)}:${s(r.refId)}`, correct: Number(r.credit) >= 1, credit: Number(r.credit) > 0 && Number(r.credit) < 1 ? Number(r.credit) : undefined,
    level: levelOfB(Number(r.difficultyB)), a: 1, b: Number(r.difficultyB), c: Number(r.guessC ?? 0),
    responseMs: 600_000, estimatedSeconds: 60, usedHint: false, at: d(r.createdAt).toISOString(), sourceWeight: Number(r.weight ?? 0.5), source: s(r.source),
  }));
  if (!outside.length) return bank;
  return [...bank, ...outside].sort((a, b) => a.at.localeCompare(b.at)).slice(-window);
}

/** The school's engine settings (exported for the Curriculum-Map remap, which recomputes mastery the same way). */
export async function skillEngineConfig(repo: Repo, schoolId: string | null): Promise<{ adaptive: AdaptiveConfig; mastery: MasteryThresholds }> {
  return engineCfg(repo, schoolId);
}
async function engineCfg(repo: Repo, schoolId: string | null): Promise<{ adaptive: AdaptiveConfig; mastery: MasteryThresholds }> {
  if (!schoolId) return resolveEngineConfig();
  const rows = await repo.findMany("SchoolSetting", { schoolId, key: { in: ["adaptive.engine", "mastery.thresholds"] } });
  const get = (k: string) => (rows.find((r) => r.key === k)?.value ?? {}) as Record<string, unknown>;
  return resolveEngineConfig(get("adaptive.engine"), get("mastery.thresholds"));
}

export interface EvidenceItem { skillId: string; source: EvidenceSource; refId: string; credit: number; b: number; c: number; weight?: number }

/**
 * Saves new evidence (already-saved refIds are skipped: no double counting) and re-computes each touched skill's
 * ability and mastery through the engine. Returns how many new rows were saved.
 */
export async function recordSkillEvidence(repo: Repo, studentId: string, items: EvidenceItem[], now = new Date()): Promise<number> {
  if (!items.length) return 0;
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) return 0;
  const have = new Set((await repo.findMany("SkillEvidence", { studentId, source: { in: [...new Set(items.map((i) => i.source))] }, refId: { in: items.map((i) => i.refId.slice(0, 120)) } }, { select: ["source", "refId"] })).map((r) => `${s(r.source)}|${s(r.refId)}`));
  const fresh = items.filter((i) => !have.has(`${i.source}|${i.refId.slice(0, 120)}`));
  if (!fresh.length) return 0;
  // weight by difficulty relative to the student's current ability on the skill: an item more than 1 logit easier
  // than what the student already does tells little (counts half again)
  const abil = new Map((await repo.findMany("StudentAbility", { studentId, scope: { in: [...new Set(fresh.map((i) => `SKILL:${i.skillId}`))] } }, { select: ["scope", "theta"] })).map((r) => [s(r.scope).slice(6), Number(r.theta)]));
  for (const i of fresh) {
    const th = abil.get(i.skillId);
    const w = (i.weight ?? SKILL_EVIDENCE_WEIGHT[i.source]) * (th !== undefined && i.b < th - 1 ? 0.5 : 1);
    await repo.create("SkillEvidence", { studentId, skillId: i.skillId, source: i.source, refId: i.refId.slice(0, 120), credit: Math.max(0, Math.min(1, i.credit)), difficultyB: Math.max(-3, Math.min(3, i.b)), guessC: Math.max(0, Math.min(0.5, i.c)), weight: Math.round(w * 1000) / 1000, createdAt: now });
  }
  const cfg = await engineCfg(repo, st.schoolId ? s(st.schoolId) : null);
  const { loadSkillItems } = await import("./items");
  for (const skillId of [...new Set(fresh.map((i) => i.skillId))]) {
    const skill = await repo.findUnique("Skill", { id: skillId });
    if (!skill) continue;
    const byId = new Map((await loadSkillItems(repo, skillId)).map((x) => [x.questionId, x]));
    const history = await skillHistoryWithEvidence(repo, studentId, skillId, byId);
    const dom = await repo.findUnique("StudentAbility", { studentId, scope: `DOMAIN:${s(skill.domain)}` });
    const prior = { mean: dom ? Number(dom.theta) : cfg.adaptive.priorMean, sd: cfg.adaptive.priorSD };
    const est = estimateAbilityEAP(history.map((r) => toWeighted(r, cfg.adaptive)), { priorMean: prior.mean, priorSD: prior.sd, thetaMin: cfg.adaptive.thetaMin, thetaMax: cfg.adaptive.thetaMax, model: cfg.adaptive.model });
    let mst = computeMastery(history, est.theta, cfg.mastery, cfg.adaptive, now, est.se);
    const prev = await repo.findUnique("StudentSkillMastery", { studentId, skillId });
    // fairness: evidence with no correct answer never raises a score the student sees
    const anyRight = fresh.some((i) => i.skillId === skillId && i.credit > 0);
    if (prev && !anyRight && mst.score > Number(prev.score)) mst = { ...mst, score: Number(prev.score), band: s(prev.band) as typeof mst.band, isMastered: Boolean(prev.isMastered) };
    const responses = history.length;
    await repo.upsert("StudentAbility", { studentId, scope: `SKILL:${skillId}` }, { skillId, theta: est.theta, thetaSE: est.se, responses }, { theta: est.theta, thetaSE: est.se, responses });
    const data = { score: mst.score, band: mst.band, maxLevelCorrect: mst.components.maxLevelCorrect, isMastered: mst.isMastered, masteredAt: mst.isMastered ? (prev?.masteredAt ?? now) : null, lastPracticedAt: now, components: { ...mst.components, external: true } };
    if (prev) await repo.updateMany("StudentSkillMastery", { studentId, skillId }, data);
    else await repo.create("StudentSkillMastery", { studentId, skillId, attempts: 0, correct: 0, ...data });
  }
  return fresh.length;
}

/** Never lets a feed break the activity that triggered it (the activity is saved first; the feed is best effort). */
export async function safeFeed(what: string, f: () => Promise<unknown>): Promise<void> {
  try { await f(); } catch (e) { log("warn", "skill_evidence.feed.failed", { what, error: e }); }
}

// ------------------------------------------------------------------ the feeds

/** ReadRise: a scored run's questions → their skills (difficulty from the version level vs the grade's On band). */
export async function feedReadRise(repo: Repo, runId: string, now = new Date()): Promise<number> {
  const run = await repo.findUnique("RRRun", { id: runId });
  if (!run || run.score === null || run.score === undefined) return 0;
  if (Number(run.readSeconds ?? 0) > 0 && Number(run.readSeconds) < RR_MIN_READ_SECONDS) return 0; // a rapid run
  const qs = await repo.findMany("RRQuestion", { articleId: run.articleId, band: run.band });
  if (!qs.length) return 0;
  const answers = (typeof run.answers === "string" ? JSON.parse(run.answers) : run.answers ?? {}) as Record<string, string>;
  const { grade, family } = await gradeSkillFamilies(repo, s(run.studentId));
  const st = await repo.findUnique("Student", { id: run.studentId });
  const { lexileBands } = await import("../curriculum-map/lexile");
  const band = (await lexileBands(repo, st?.schoolId ? s(st.schoolId) : null))[grade];
  const mid = band ? (Number(band.onMin) + Number(band.onMax)) / 2 : 700 + 120 * (grade - 4);
  const b = (Number(run.versionLevel) - mid) / RR_POINTS_PER_LOGIT;
  const items: EvidenceItem[] = [];
  for (const q of qs) {
    const skillId = firstFamily(family, RR_SKILL_MAP[s(q.skill).toLowerCase()]);
    if (!skillId) continue;
    const chosen = answers[String(q.number)];
    if (chosen === undefined || chosen === null || chosen === "") continue;
    const n = Array.isArray(q.options) ? q.options.length : (() => { try { return (JSON.parse(s(q.options)) as unknown[]).length; } catch { return 4; } })();
    items.push({ skillId, source: "READRISE", refId: `${runId}:${Number(q.number)}`, credit: String(chosen).toUpperCase() === s(q.answer).toUpperCase() ? 1 : 0, b, c: n >= 2 ? Math.min(0.5, 1 / n) : 0.25 });
  }
  return recordSkillEvidence(repo, s(run.studentId), items, now);
}

/**
 * Word review: the words reviewed → the grade's Concept Vocabulary skill. Curricula without a Concept Vocabulary SKILL
 * (it is a Curriculum Map section whose questions sit in the hidden "Unclassified" skill) use the grade's Context
 * Clues skill instead: each review item shows the word in its context sentence and asks for its meaning.
 */
export async function feedVocabulary(repo: Repo, studentId: string, results: { word: string; correct: boolean }[], now = new Date()): Promise<number> {
  if (!results.length) return 0;
  const { byName, family } = await gradeSkillFamilies(repo, studentId);
  const cv = byName.find((k) => k.isActive !== false && (/concept[- ]vocabulary/i.test(`${s(k.code)} ${s(k.name)}`) || (/\bvocabulary\b/i.test(s(k.name)) && !/context|unclassified/i.test(s(k.name)))));
  const skillId = cv ? s(cv.id) : firstFamily(family, ["context-clues"]);
  if (!skillId) return 0;
  const skill = { id: skillId };
  const day = now.toISOString().slice(0, 10);
  return recordSkillEvidence(repo, studentId, results.map((r) => ({ skillId: s(skill.id), source: "VOCAB" as const, refId: `${day}:${r.word.toLowerCase()}`, credit: r.correct ? 1 : 0, b: -0.5, c: 0.25 })), now);
}

/** Teacher-scored writing (rubric traits 1–4) → the genre's writing skill; conventions → Capitalization. */
export async function feedWriting(repo: Repo, studentId: string, taskId: string, scores: Record<string, number>, genre: string | null, now = new Date(), taskSkillId: string | null = null): Promise<number> {
  const vals = Object.entries(scores).filter(([, v]) => Number.isFinite(Number(v)));
  if (!vals.length) return 0;
  const { family } = await gradeSkillFamilies(repo, studentId);
  const g = s(genre).toLowerCase();
  // the skill the task names (when the teacher chose one), else the genre's writing skill
  const writing = taskSkillId ?? firstFamily(family, [/narr/.test(g) ? "writing-narrative" : /arg|opinion|persua/.test(g) ? "writing-argument" : "writing-informative", "writing-informative", "writing-narrative"]);
  const scaled = (v: number) => Math.max(0, Math.min(1, (Number(v) - 1) / 3));
  const items: EvidenceItem[] = [];
  const main = vals.filter(([k]) => k !== "conventions");
  if (writing && main.length) items.push({ skillId: writing, source: "WRITING", refId: `${taskId}:traits`, credit: main.reduce((t, [, v]) => t + scaled(v), 0) / main.length, b: 0, c: 0 });
  const conv = vals.find(([k]) => k === "conventions");
  const caps = firstFamily(family, ["capitalization", "commas"]);
  if (conv && caps) items.push({ skillId: caps, source: "WRITING", refId: `${taskId}:conventions`, credit: scaled(conv[1]), b: 0, c: 0, weight: 0.3 });
  return recordSkillEvidence(repo, studentId, items, now);
}

/** Respond to Reading marked by the teacher (0–4) → Cite Text Evidence. */
export async function feedRespond(repo: Repo, studentId: string, assignmentId: string, score: number, now = new Date()): Promise<number> {
  const { family } = await gradeSkillFamilies(repo, studentId);
  const skillId = firstFamily(family, ["text-evidence", "central-idea"]);
  if (!skillId) return 0;
  return recordSkillEvidence(repo, studentId, [{ skillId, source: "RTR", refId: `${assignmentId}`, credit: Math.max(0, Math.min(1, Number(score) / 4)), b: 0, c: 0 }], now);
}
