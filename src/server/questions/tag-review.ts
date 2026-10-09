/**
 * 🏷️ One question bank, fully tagged. Every question already lives in the one Question table (Curriculum Map,
 * Skills, Grammar, Concept Vocabulary, ReadMaster). Its tags are DERIVED from what the platform already knows —
 * no copy to keep in sync:
 *   place on the Curriculum Map → Grade, Unit, Text Set, Section, Level
 *   skill → Skill, CCSS standard, MAP subject + goal area (skill family)
 *   the question → type, cognitive level, Lexile, difficulty → estimated RIT band
 * Each question is “Suggested” (derived, not checked) until an admin marks it “Verified” — one by one in the
 * ~10% random sample of a batch (one skill), or the whole batch at once. The estimated RIT is recalibrated from
 * real answers: item RIT ≈ mean RIT of the students who answered + 10 × ln(wrong / right) (the RIT scale is
 * 10 points per logit), once enough students with a MAP score have answered.
 * Review data is kept in Question.tags (JSON): reversible, no schema change.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes } from "../curriculum-map/questions";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { ensureNationalNorms, nationalNorm } from "../map/rit";

const s = (v: unknown) => String(v ?? "");
const tagsOf = (q: Row): Record<string, unknown> => { let t: unknown = q.tags; if (typeof t === "string") { try { t = JSON.parse(t); } catch { t = null; } } return t && typeof t === "object" ? (t as Record<string, unknown>) : {}; };
export const MIN_CALIBRATION_ANSWERS = 15;
const SECTION: Record<string, string> = { CONCEPT_VOCABULARY: "Concept Vocabulary", ANALYZE_CRAFT_AND_STRUCTURE: "Analyze Craft and Structure", RESPOND_TO_READING: "Respond to Reading" };

export interface QuestionTags {
  id: string; stem: string; status: string;
  grade: number | null; unit: string | null; textSet: string | null; section: string | null; level: "BELOW" | "ON" | "ABOVE";
  levelFrom: "MAP" | "DIFFICULTY"; skill: string; standard: string | null; mapSubject: string | null; goalArea: string | null;
  type: string; cognitive: string | null; lexile: number | null; difficulty: number;
  rit: { value: number | null; band: string | null; calibrated: boolean; answers: number };
  review: "VERIFIED" | "SUGGESTED"; missing: string[];
}

export const ritBand = (rit: number | null) => (rit === null ? null : `${Math.floor((rit - 1) / 10) * 10 + 1}–${Math.floor((rit - 1) / 10) * 10 + 10}`);

/** Difficulty 1–7 → a RIT estimate for the grade: the grade's Fall mean ± 1 SD across the scale. */
export function ritFromDifficulty(difficulty: number, norm: { mean: number; sd: number } | null): number | null {
  if (!norm) return null;
  return Math.round(norm.mean + ((Math.max(1, Math.min(7, difficulty)) - 4) / 3) * norm.sd);
}

/** The tags of these questions (school scope: their skills belong to the school's grades). */
export async function questionTags(repo: Repo, schoolId: string, ids: string[]): Promise<QuestionTags[]> {
  if (!ids.length) return [];
  await ensureNationalNorms(repo);
  const qs = await repo.findMany("Question", { id: { in: ids }, deletedAt: null }, { select: ["id", "stem", "status", "skillId", "standardId", "typeId", "difficultyLevel", "lexile", "tags"] });
  const [links, skills, types, nodes] = await Promise.all([
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }),
    repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "name", "familyId", "curriculumId"] }),
    repo.findMany("QuestionType", {}, { select: ["id", "name"] }),
    attachmentNodes(repo, schoolId),
  ]);
  const [fams, skillStd, curs] = await Promise.all([
    skills.length ? repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] }) : Promise.resolve([] as Row[]),
    skills.length ? repo.findMany("SkillStandard", { skillId: { in: skills.map((k) => k.id) } }) : Promise.resolve([] as Row[]),
    skills.length ? repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : Promise.resolve([] as Row[]),
  ]);
  const [areas, stds, grades] = await Promise.all([
    fams.length ? repo.findMany("MapGoalArea", { id: { in: [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))] } }) : Promise.resolve([] as Row[]),
    repo.findMany("Standard", { id: { in: [...new Set([...skillStd.map((x) => s(x.standardId)), ...qs.map((q) => s(q.standardId)).filter(Boolean)])] } }, { select: ["id", "code"] }),
    curs.length ? repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level", "schoolId"] }) : Promise.resolve([] as Row[]),
  ]);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const norms = new Map<number, { mean: number; sd: number } | null>();
  for (const g of new Set(grades.map((x) => Number(x.level)))) norms.set(g, await nationalNorm(repo, g, "FALL"));
  const out: QuestionTags[] = [];
  for (const q of qs) {
    const skill = skills.find((k) => k.id === q.skillId);
    const grade = grades.find((g) => g.id === curs.find((c) => c.id === skill?.curriculumId)?.gradeId);
    if (!grade || s(grade.schoolId) !== schoolId) continue;
    const node = links.filter((l) => l.questionId === q.id).map((l) => nodeById.get(s(l.nodeId))).find(Boolean);
    const fam = fams.find((f) => f.id === skill?.familyId);
    const area = areas.find((a) => a.id === fam?.mapGoalAreaId);
    const stdId = s(q.standardId) || s(skillStd.filter((x) => x.skillId === q.skillId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.standardId);
    const std = stds.find((x) => x.id === stdId);
    const t = tagsOf(q);
    const cal = t.rit && typeof t.rit === "object" ? (t.rit as { value?: number; answers?: number }) : null;
    const estimate = ritFromDifficulty(Number(q.difficultyLevel ?? 4), norms.get(Number(grade.level)) ?? null);
    const value = cal?.value ?? estimate;
    const missing = [!node && "Curriculum Map place", !std && "standard", !area && "MAP goal area", q.lexile === null || q.lexile === undefined ? "Lexile" : null, !t.cognitiveLevel && "cognitive level"].filter(Boolean) as string[];
    out.push({
      id: s(q.id), stem: s(q.stem), status: s(q.status), grade: Number(grade.level),
      unit: node ? node.unitTitle : null, textSet: node ? node.heading : null, section: node ? SECTION[node.category] ?? node.categoryLabel : null,
      level: (node?.level ?? fromDifficulty(Number(q.difficultyLevel ?? 4))) as QuestionTags["level"], levelFrom: node?.level ? "MAP" : "DIFFICULTY",
      skill: s(skill?.name), standard: std ? s(std.code).replace(/^CCSS\.ELA-LITERACY\./, "") : null,
      mapSubject: area ? (s(area.subject) === "LANGUAGE_USAGE" ? "Language Usage" : "Reading") : null, goalArea: area ? s(area.name) : null,
      type: s(types.find((x) => x.id === q.typeId)?.name), cognitive: t.cognitiveLevel ? s(t.cognitiveLevel) : null,
      lexile: q.lexile === null || q.lexile === undefined ? null : Number(q.lexile), difficulty: Number(q.difficultyLevel ?? 4),
      rit: { value, band: ritBand(value), calibrated: Boolean(cal?.value), answers: Number(cal?.answers ?? 0) },
      review: (t.review as { status?: string } | undefined)?.status === "VERIFIED" ? "VERIFIED" : "SUGGESTED", missing,
    });
  }
  return out;
}

// ------------------------------------------------------------------ batches (one skill = one batch)

export interface BatchRow { skillId: string; skill: string; questions: number; verified: number }
function assertAdmin(actor: Actor) {
  assertCan(actor, "questions:publish");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins review tags.");
}

async function gradeSkills(repo: Repo, schoolId: string, grade: number): Promise<Row[]> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
  if (!g) return [];
  const curs = await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] });
  return curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "sequence"] })) : [];
}

export async function reviewBatches(repo: Repo, actor: Actor, grade: number): Promise<BatchRow[]> {
  assertAdmin(actor);
  const skills = await gradeSkills(repo, actor.schoolId!, grade);
  if (!skills.length) return [];
  const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, deletedAt: null, status: { in: ["PUBLISHED", "DRAFT", "UNDER_REVIEW"] } }, { select: ["skillId", "tags"] });
  return skills.map((k) => { const mine = qs.filter((q) => q.skillId === k.id); return { skillId: s(k.id), skill: s(k.name), questions: mine.length, verified: mine.filter((q) => (tagsOf(q).review as { status?: string } | undefined)?.status === "VERIFIED").length }; })
    .filter((b) => b.questions > 0).sort((a, b) => (a.verified / a.questions) - (b.verified / b.questions) || a.skill.localeCompare(b.skill));
}

/** A small seeded random generator: the same sample for the same seed (stable while reviewing). */
function seeded(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

export interface BatchView { skillId: string; skill: string; total: number; verified: number; summary: { levels: Record<string, number>; missing: Record<string, number>; goalArea: string | null; mapSubject: string | null; ritRange: string | null }; sample: QuestionTags[]; seed: string }

export async function reviewBatch(repo: Repo, actor: Actor, skillId: string, seed = new Date().toISOString().slice(0, 10)): Promise<BatchView> {
  assertAdmin(actor);
  const skill = await repo.findUnique("Skill", { id: skillId });
  if (!skill) throw new ValidationError("Skill not found.");
  const ids = (await repo.findMany("Question", { skillId, deletedAt: null, status: { in: ["PUBLISHED", "DRAFT", "UNDER_REVIEW"] } }, { select: ["id"] })).map((q) => s(q.id));
  const tags = await questionTags(repo, actor.schoolId!, ids);
  if (ids.length && !tags.length) throw new ForbiddenError("This skill is not in your school.");
  const levels: Record<string, number> = { BELOW: 0, ON: 0, ABOVE: 0 }, missing: Record<string, number> = {};
  for (const t of tags) { levels[t.level]++; for (const m of t.missing) missing[m] = (missing[m] ?? 0) + 1; }
  const rits = tags.map((t) => t.rit.value).filter((x): x is number => x !== null);
  // ~10% random sample (at least 5, at most 25), unverified first
  const rnd = seeded(`${skillId}:${seed}`);
  const pool = [...tags].sort((a, b) => Number(a.review === "VERIFIED") - Number(b.review === "VERIFIED") || rnd() - 0.5);
  const unverified = pool.filter((t) => t.review !== "VERIFIED");
  const size = Math.min(tags.length, Math.max(5, Math.min(25, Math.ceil(tags.length * 0.1))));
  const sample = (unverified.length >= size ? unverified : pool).slice(0, size);
  return {
    skillId, skill: s(skill.name), total: tags.length, verified: tags.filter((t) => t.review === "VERIFIED").length, seed,
    summary: { levels, missing, goalArea: tags.find((t) => t.goalArea)?.goalArea ?? null, mapSubject: tags.find((t) => t.mapSubject)?.mapSubject ?? null, ritRange: rits.length ? `${Math.min(...rits)}–${Math.max(...rits)}` : null },
    sample,
  };
}

async function markVerified(repo: Repo, actor: Actor, ids: string[], now: Date): Promise<number> {
  const qs = ids.length ? await repo.findMany("Question", { id: { in: ids } }, { select: ["id", "tags", "skillId"] }) : [];
  const ok = new Set((await questionTags(repo, actor.schoolId!, qs.map((q) => s(q.id)))).map((t) => t.id));   // school scope
  let n = 0;
  for (const q of qs) {
    if (!ok.has(s(q.id))) continue;
    await repo.updateMany("Question", { id: q.id }, { tags: { ...tagsOf(q), review: { status: "VERIFIED", by: actor.userId, at: now.toISOString() } } });
    n++;
  }
  return n;
}

export async function verifyQuestions(repo: Repo, actor: Actor, ids: string[], now = new Date()): Promise<number> {
  assertAdmin(actor);
  return markVerified(repo, actor, ids.slice(0, 500), now);
}

export async function verifyBatch(repo: Repo, actor: Actor, skillId: string, now = new Date()): Promise<number> {
  assertAdmin(actor);
  const ids = (await repo.findMany("Question", { skillId, deletedAt: null }, { select: ["id"] })).map((q) => s(q.id));
  return markVerified(repo, actor, ids, now);
}

/** Back to “Suggested” (undo). */
export async function unverifyQuestions(repo: Repo, actor: Actor, ids: string[]): Promise<number> {
  assertAdmin(actor);
  const qs = ids.length ? await repo.findMany("Question", { id: { in: ids.slice(0, 500) } }, { select: ["id", "tags"] }) : [];
  const ok = new Set((await questionTags(repo, actor.schoolId!, qs.map((q) => s(q.id)))).map((t) => t.id));
  let n = 0;
  for (const q of qs) { if (!ok.has(s(q.id))) continue; const { review: _r, ...rest } = tagsOf(q); await repo.updateMany("Question", { id: q.id }, { tags: rest }); n++; }
  return n;
}

/**
 * 📐 Recalibrates the RIT of a grade's questions from real answers: for each question answered (carefully) by at
 * least MIN_CALIBRATION_ANSWERS students who have a MAP Reading or Language score, item RIT = their mean RIT
 * + 10 × ln(wrong / right). Proportions are kept within 5–95% so one perfect class does not push it to the edges.
 */
export async function recalibrateRit(repo: Repo, actor: Actor, grade: number, now = new Date()): Promise<{ questions: number; calibrated: number }> {
  assertAdmin(actor);
  const skills = await gradeSkills(repo, actor.schoolId!, grade);
  if (!skills.length) return { questions: 0, calibrated: 0 };
  const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, deletedAt: null }, { select: ["id", "tags", "skillId"] });
  if (!qs.length) return { questions: 0, calibrated: 0 };
  const areaSubject = new Map<string, "READING" | "LANGUAGE">();
  const fams = await repo.findMany("Skill", { id: { in: skills.map((k) => k.id) } }, { select: ["id", "familyId"] });
  const famRows = fams.length ? await repo.findMany("SkillFamily", { id: { in: [...new Set(fams.map((f) => s(f.familyId)))] } }, { select: ["id", "mapGoalAreaId"] }) : [];
  const areaRows = famRows.length ? await repo.findMany("MapGoalArea", { id: { in: [...new Set(famRows.map((f) => s(f.mapGoalAreaId)).filter(Boolean))] } }, { select: ["id", "subject"] }) : [];
  for (const f of fams) { const a = areaRows.find((x) => x.id === famRows.find((y) => y.id === f.familyId)?.mapGoalAreaId); areaSubject.set(s(f.id), s(a?.subject) === "LANGUAGE_USAGE" ? "LANGUAGE" : "READING"); }
  const attempts = await repo.findMany("QuestionAttempt", { questionId: { in: qs.map((q) => q.id) } }, { select: ["questionId", "studentId", "isCorrect", "rapidGuess"] });
  const students = [...new Set(attempts.map((a) => s(a.studentId)))];
  const results = students.length ? (await repo.findMany("MapResult", { studentId: { in: students } })).filter((r) => !r.goalName) : [];
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const latest = (sid: string, subj: "READING" | "LANGUAGE") => results.filter((r) => r.studentId === sid && (subj === "READING" ? /read/i : /language/i).test(s(r.subject))).sort((a, b) => t(b.testDate) - t(a.testDate))[0];
  let calibrated = 0;
  for (const q of qs) {
    const subj = areaSubject.get(s(q.skillId)) ?? "READING";
    const mine = attempts.filter((a) => a.questionId === q.id && !a.rapidGuess).map((a) => ({ ok: Boolean(a.isCorrect), rit: latest(s(a.studentId), subj) ?? latest(s(a.studentId), subj === "READING" ? "LANGUAGE" : "READING") })).filter((a) => a.rit);
    if (mine.length < MIN_CALIBRATION_ANSWERS) continue;
    const p = Math.max(0.05, Math.min(0.95, mine.filter((a) => a.ok).length / mine.length));
    const meanRit = mine.reduce((sum, a) => sum + Number(a.rit!.rit), 0) / mine.length;
    const value = Math.round(meanRit + 10 * Math.log((1 - p) / p));
    await repo.updateMany("Question", { id: q.id }, { tags: { ...tagsOf(q), rit: { value, answers: mine.length, at: now.toISOString() } } });
    calibrated++;
  }
  return { questions: qs.length, calibrated };
}
