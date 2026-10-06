/**
 * AI-assisted question bank (admins generate; teachers and admins review).
 *
 *   Grade → Book → Unit → Lesson → Skill → Standard → number of questions
 *        ↓ prompt from CURRICULUM DATA ONLY (no student data, see src/server/ai/question-generator.ts)
 *   AI reply → automatic validation → valid questions saved as DRAFT (origin AI_GENERATED)
 *        ↓ review (edit / approve / reject)      → approved = PUBLISHED, the only status the
 *                                                  adaptive engine reads (unchanged engine)
 *
 * Automatic validation of every generated question:
 *  - structure: question text, 4 options, exactly one correct answer, a rationale for every
 *    wrong option, an explanation, a known cognitive level (then the full bank validator)
 *  - mapping: the skill and standard the AI states must be the ones requested, and the standard
 *    must be linked to the skill; the lesson must teach the skill
 *  - difficulty: each question must have the level of its slot; the batch is checked against
 *    the target easy / medium / hard split
 *  - duplicates: against every question already in the skill and within the batch
 * Invalid questions are not saved; the reasons are reported.
 */
import { randomBytes } from "node:crypto";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import type { Repo, Row } from "../seeding/repo";
import { buildPrompt, COGNITIVE_LEVELS, parseGenerated, type AiProvider, type GeneratedQuestion, type GenerationContext } from "../ai/question-generator";
import { createDraft } from "./questions";
import { schoolOf } from "./users";

// ------------------------------------------------------------ difficulty bands

export type Band = "easy" | "medium" | "hard";
export const bandOf = (level: number): Band => (level <= 2 ? "easy" : level <= 5 ? "medium" : "hard");
/** Default target per skill: 12 approved questions = 3 easy, 6 medium, 3 hard. */
export const DEFAULT_TARGET = 12;
export function bandTargets(total: number): Record<Band, number> {
  const easy = Math.round(total * 0.25), hard = Math.round(total * 0.25);
  return { easy, medium: total - easy - hard, hard };
}
const BAND_LEVELS: Record<Band, number[]> = { easy: [2, 1], medium: [4, 3, 5], hard: [6, 7] };
export const MAX_PER_REQUEST = 20;

/** Difficulty plan: how many of each band, spread over the band's levels. */
export function planSlots(counts: Record<Band, number>): { slot: number; level: number }[] {
  const out: { slot: number; level: number }[] = [];
  for (const b of ["easy", "medium", "hard"] as Band[]) for (let i = 0; i < counts[b]; i++) out.push({ slot: out.length + 1, level: BAND_LEVELS[b][i % BAND_LEVELS[b].length] });
  return out;
}

// ------------------------------------------------------------- curriculum tree

export interface TreeSkill { id: string; code: string; name: string; standards: { id: string; code: string; description: string | null }[] }
export interface TreeLesson { id: string; code: string; title: string; skills: TreeSkill[] }
export interface TreeUnit { id: string; number: number; title: string; lessons: TreeLesson[] }
export interface TreeBook { curriculumId: string; book: string; units: TreeUnit[] }
export interface TreeGrade { level: number; books: TreeBook[] }

const short = (code: string) => code.replace(/^CCSS\.ELA-LITERACY\./, "");

/** Grade → Book → Unit → Lesson → Skill → Standard, for the selectors (curriculum only). */
export async function curriculumTree(repo: Repo, actor: Actor): Promise<TreeGrade[]> {
  assertCan(actor, "questions:generate");
  const schoolId = schoolOf(actor);
  const grades = (await repo.findMany("Grade", { schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const curricula = grades.length ? await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }) : [];
  const books = curricula.length ? await repo.findMany("Book", { id: { in: curricula.map((c) => c.bookId) } }) : [];
  const units = curricula.length ? (await repo.findMany("Unit", { curriculumId: { in: curricula.map((c) => c.id) } })).filter((u) => !u.deletedAt) : [];
  const lessons = units.length ? (await repo.findMany("Lesson", { unitId: { in: units.map((u) => u.id) } })).filter((l) => !l.deletedAt) : [];
  const links = lessons.length ? await repo.findMany("LessonSkill", { lessonId: { in: lessons.map((l) => l.id) } }) : [];
  const skills = links.length ? (await repo.findMany("Skill", { id: { in: [...new Set(links.map((l) => l.skillId))] } })).filter((s) => !s.deletedAt) : [];
  const ss = skills.length ? await repo.findMany("SkillStandard", { skillId: { in: skills.map((s) => s.id) } }) : [];
  const stds = ss.length ? await repo.findMany("Standard", { id: { in: [...new Set(ss.map((x) => x.standardId))] } }) : [];
  const skillNode = (s: Row): TreeSkill => ({
    id: String(s.id), code: String(s.code), name: String(s.name),
    standards: ss.filter((x) => x.skillId === s.id).map((x) => stds.find((d) => d.id === x.standardId)!).filter(Boolean)
      .map((d) => ({ id: String(d.id), code: short(String(d.code)), description: d.description ? String(d.description) : null })),
  });
  return grades.map((g) => ({
    level: Number(g.level),
    books: curricula.filter((c) => c.gradeId === g.id).map((c) => ({
      curriculumId: String(c.id), book: String(books.find((b) => b.id === c.bookId)?.title ?? c.name),
      units: units.filter((u) => u.curriculumId === c.id).sort((a, b) => Number(a.number) - Number(b.number)).map((u) => ({
        id: String(u.id), number: Number(u.number), title: String(u.title),
        lessons: lessons.filter((l) => l.unitId === u.id).sort((a, b) => Number(a.number) - Number(b.number)).map((l) => ({
          id: String(l.id), code: String(l.code), title: String(l.title),
          skills: [...new Set(links.filter((k) => k.lessonId === l.id).map((k) => String(k.skillId)))].map((sid) => skills.find((s) => s.id === sid)).filter((s): s is Row => !!s).map(skillNode),
        })),
      })),
    })),
  }));
}

// ------------------------------------------------------------------- coverage

export interface CoverageRow {
  skillId: string;
  code: string;
  name: string;
  approved: number;
  approvedByBand: Record<Band, number>;
  pendingReview: number;
  target: number;
  /** still needed after approved AND pending drafts are counted (what “Generate Missing” makes) */
  needed: number;
  neededByBand: Record<Band, number>;
}

export async function skillCoverage(repo: Repo, actor: Actor, gradeLevel: number, target = DEFAULT_TARGET): Promise<CoverageRow[]> {
  assertCan(actor, "questions:read");
  const grade = (await repo.findMany("Grade", { schoolId: schoolOf(actor), level: gradeLevel }))[0];
  if (!grade) return [];
  const curricula = await repo.findMany("Curriculum", { gradeId: grade.id });
  const skills = curricula.length ? (await repo.findMany("Skill", { curriculumId: { in: curricula.map((c) => c.id) } })).filter((s) => !s.deletedAt && s.domain !== "WRITING") : [];
  const qs = skills.length ? (await repo.findMany("Question", { skillId: { in: skills.map((s) => s.id) } })).filter((q) => !q.deletedAt) : [];
  const t = bandTargets(target);
  return skills.sort((a, b) => Number(a.sequence) - Number(b.sequence)).map((s) => {
    const mine = qs.filter((q) => q.skillId === s.id);
    const approved = mine.filter((q) => q.status === "PUBLISHED");
    const pending = mine.filter((q) => q.status === "DRAFT" || q.status === "UNDER_REVIEW");
    const by = (rows: Row[]) => ({ easy: 0, medium: 0, hard: 0, ...Object.fromEntries((["easy", "medium", "hard"] as Band[]).map((b) => [b, rows.filter((q) => bandOf(Number(q.difficultyLevel)) === b).length])) }) as Record<Band, number>;
    const ab = by(approved), pb = by(pending);
    const neededByBand = Object.fromEntries((["easy", "medium", "hard"] as Band[]).map((b) => [b, Math.max(0, t[b] - ab[b] - pb[b])])) as Record<Band, number>;
    return {
      skillId: String(s.id), code: String(s.code), name: String(s.name), approved: approved.length, approvedByBand: ab, pendingReview: pending.length, target,
      neededByBand, needed: neededByBand.easy + neededByBand.medium + neededByBand.hard,
    };
  });
}

// ----------------------------------------------------------------- validation

const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
const overlap = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / (a.size + b.size - i || 1);
};

export interface ExistingItem { stem: string; correct: string; options: string[] }
export interface ItemCheck { slot: number; ok: boolean; reasons: string[] }

/** Validates raw AI output for one request (pure; tested directly). */
export function validateGenerated(raw: unknown[], ctx: { skillCode: string; standardCodes: string[]; requestedStandard: string; slots: { slot: number; level: number }[] }, existing: ExistingItem[]): { items: (GeneratedQuestion | null)[]; checks: ItemCheck[] } {
  const items: (GeneratedQuestion | null)[] = [];
  const checks: ItemCheck[] = [];
  const accepted: ExistingItem[] = [];
  ctx.slots.forEach((slot, idx) => {
    const r = (raw.find((x) => (x as { slot?: number })?.slot === slot.slot) ?? raw[idx]) as Partial<GeneratedQuestion> | undefined;
    const reasons: string[] = [];
    if (!r || typeof r !== "object") {
      checks.push({ slot: slot.slot, ok: false, reasons: ["missing from the AI reply"] });
      items.push(null);
      return;
    }
    // structure and answers
    if (typeof r.stem !== "string" || r.stem.trim().length < 10) reasons.push("question text missing or too short");
    const opts = Array.isArray(r.options) ? r.options : [];
    if (opts.length !== 4) reasons.push(`needs exactly 4 answer choices (got ${opts.length})`);
    if (opts.some((o) => !o || typeof o.text !== "string" || !o.text.trim())) reasons.push("an answer choice is empty");
    const correct = opts.filter((o) => o && o.correct === true);
    if (correct.length !== 1) reasons.push(`needs exactly one correct answer (got ${correct.length})`);
    if (opts.some((o) => o && o.correct !== true && !(typeof o.rationale === "string" && o.rationale.trim()))) reasons.push("a wrong answer has no rationale");
    if (new Set(opts.map((o) => norm(String(o?.text ?? "")))).size !== opts.length) reasons.push("two answer choices are the same");
    if (typeof r.explanation !== "string" || !r.explanation.trim()) reasons.push("explanation missing");
    if (!COGNITIVE_LEVELS.includes(r.cognitiveLevel as never)) reasons.push(`cognitive level must be one of ${COGNITIVE_LEVELS.join(", ")}`);
    // mapping
    if (String(r.skillCode ?? "").trim() !== ctx.skillCode) reasons.push(`wrong skill: “${r.skillCode ?? "(none)"}” instead of ${ctx.skillCode}`);
    const std = short(String(r.standardCode ?? "").trim());
    if (std !== ctx.requestedStandard) reasons.push(`wrong standard: “${r.standardCode ?? "(none)"}” instead of ${ctx.requestedStandard}`);
    else if (!ctx.standardCodes.includes(std)) reasons.push(`standard ${std} is not linked to skill ${ctx.skillCode}`);
    // difficulty
    if (Number(r.level) !== slot.level) reasons.push(`difficulty ${r.level ?? "(none)"} does not match the requested level ${slot.level}`);
    // duplicates (existing questions for the skill, and earlier questions in this batch)
    if (typeof r.stem === "string" && correct.length === 1) {
      const me: ExistingItem = { stem: r.stem, correct: String(correct[0].text), options: opts.map((o) => String(o?.text ?? "")) };
      const mw = words([me.stem, ...me.options].join(" "));
      for (const e of [...existing, ...accepted]) {
        const ew = words([e.stem, ...e.options].join(" "));
        const sameAnswer = norm(e.correct) === norm(me.correct);
        const o = overlap(mw, ew);
        if (o >= 0.6 || (sameAnswer && overlap(words(me.stem), words(e.stem)) >= 0.5)) {
          reasons.push(`duplicate of an existing question: “${e.stem.slice(0, 60)}…”`);
          break;
        }
      }
      if (!reasons.length) accepted.push(me);
    }
    checks.push({ slot: slot.slot, ok: reasons.length === 0, reasons });
    items.push(reasons.length ? null : (r as GeneratedQuestion));
  });
  return { items, checks };
}

/** Difficulty balance of the saved questions against the planned split. */
export function balanceReport(planned: { level: number }[], saved: { level: number }[]): { planned: Record<Band, number>; saved: Record<Band, number>; warnings: string[] } {
  const count = (xs: { level: number }[]) => ({ easy: xs.filter((x) => bandOf(x.level) === "easy").length, medium: xs.filter((x) => bandOf(x.level) === "medium").length, hard: xs.filter((x) => bandOf(x.level) === "hard").length });
  const p = count(planned), s = count(saved);
  const warnings = (["easy", "medium", "hard"] as Band[]).filter((b) => s[b] < p[b]).map((b) => `${p[b] - s[b]} ${b} question(s) were rejected; generate again to fill the ${b} level.`);
  return { planned: p, saved: s, warnings };
}

// ----------------------------------------------------------------- generation

export interface GenerateRequest {
  skillId: string;
  standardId: string;
  lessonId?: string | null;
  /** either a total count (split 25 / 50 / 25) or exact counts per band */
  count?: number;
  byBand?: Record<Band, number>;
}

export interface GenerateResult {
  batch: string;
  requested: number;
  saved: { id: string; level: number; stem: string }[];
  rejected: { slot: number; level: number; reasons: string[] }[];
  balance: ReturnType<typeof balanceReport>;
}

async function contextFor(repo: Repo, actor: Actor, req: GenerateRequest) {
  const skill = await repo.findUnique("Skill", { id: req.skillId });
  const cur = skill ? await repo.findUnique("Curriculum", { id: skill.curriculumId }) : null;
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!skill || skill.deletedAt || !grade || grade.schoolId !== schoolOf(actor)) throw new ForbiddenError("Skill not found.");
  const links = await repo.findMany("SkillStandard", { skillId: skill.id });
  const stds = links.length ? await repo.findMany("Standard", { id: { in: links.map((l) => l.standardId) } }) : [];
  const standard = stds.find((s) => s.id === req.standardId);
  if (!standard) throw new ValidationError("Choose a standard that is linked to this skill.");
  let lesson: Row | null = null, unit: Row | null = null;
  if (req.lessonId) {
    lesson = await repo.findUnique("Lesson", { id: req.lessonId });
    if (!lesson || !(await repo.findMany("LessonSkill", { lessonId: req.lessonId, skillId: skill.id })).length) throw new ValidationError("That lesson does not teach this skill.");
    unit = await repo.findUnique("Unit", { id: lesson.unitId });
  }
  const book = await repo.findUnique("Book", { id: cur!.bookId });
  return { skill, grade, book, lesson, unit, standard, standardCodes: stds.map((s) => short(String(s.code))) };
}

/** Up to 5 approved questions of the skill, spread across levels, as style examples for the AI. */
async function examplesFor(repo: Repo, skillId: string): Promise<NonNullable<GenerationContext["examples"]>> {
  const qs = (await repo.findMany("Question", { skillId, status: "PUBLISHED" })).filter((q) => !q.deletedAt).sort((a, b) => Number(a.difficultyLevel) - Number(b.difficultyLevel));
  const picked = qs.length <= 5 ? qs : [0, 1, 2, 3, 4].map((i) => qs[Math.round((i * (qs.length - 1)) / 4)]);
  const opts = picked.length ? await repo.findMany("QuestionOption", { questionId: { in: picked.map((q) => q.id) } }) : [];
  return picked.map((q) => {
    const mine = opts.filter((o) => o.questionId === q.id).sort((x, y) => String(x.label).localeCompare(String(y.label)));
    return { stem: String(q.stem), options: mine.map((o) => String(o.text)), correct: String(mine.find((o) => o.isCorrect)?.text ?? ""), level: Number(q.difficultyLevel) };
  });
}

async function existingFor(repo: Repo, skillId: string): Promise<ExistingItem[]> {
  const qs = (await repo.findMany("Question", { skillId })).filter((q) => !q.deletedAt && q.status !== "ARCHIVED");
  const opts = qs.length ? await repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) } }) : [];
  return qs.map((q) => {
    const mine = opts.filter((o) => o.questionId === q.id);
    return { stem: String(q.stem), correct: String(mine.find((o) => o.isCorrect)?.text ?? ""), options: mine.map((o) => String(o.text)) };
  });
}

export async function generateQuestions(repo: Repo, actor: Actor, provider: AiProvider, req: GenerateRequest, now = new Date()): Promise<GenerateResult> {
  assertCan(actor, "questions:generate");
  const counts: Record<Band, number> = req.byBand ?? bandTargets(Math.round(Number(req.count ?? 0)));
  const total = counts.easy + counts.medium + counts.hard;
  if (!Number.isInteger(total) || total < 1 || total > MAX_PER_REQUEST) throw new ValidationError(`Ask for between 1 and ${MAX_PER_REQUEST} questions at a time.`);
  const c = await contextFor(repo, actor, req);
  const slots = planSlots(counts);
  const existing = await existingFor(repo, String(c.skill.id));
  const ctx: GenerationContext = {
    grade: Number(c.grade.level), book: String(c.book?.title ?? ""),
    unit: c.unit ? { number: Number(c.unit.number), title: String(c.unit.title) } : null,
    lesson: c.lesson ? { code: String(c.lesson.code), title: String(c.lesson.title), genre: c.lesson.genre ? String(c.lesson.genre) : null } : null,
    skill: { code: String(c.skill.code), name: String(c.skill.name), description: c.skill.description ? String(c.skill.description) : null, domain: String(c.skill.domain) },
    standard: { code: short(String(c.standard.code)), description: c.standard.description ? String(c.standard.description) : null },
    slots, avoid: existing.map((e) => e.stem), examples: await examplesFor(repo, String(c.skill.id)),
  };
  const prompt = buildPrompt(ctx);
  let raw: unknown[];
  try {
    raw = parseGenerated(await provider.complete(prompt.system, prompt.user));
  } catch (e) {
    throw new ValidationError(`The AI reply could not be used: ${(e as Error).message}`);
  }
  const { items, checks } = validateGenerated(raw, { skillCode: ctx.skill.code, standardCodes: c.standardCodes, requestedStandard: ctx.standard.code, slots }, existing);
  const batch = `ai-${now.toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`;
  const saved: GenerateResult["saved"] = [];
  const rejected: GenerateResult["rejected"] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = items[i];
    if (!g) {
      rejected.push({ slot: slots[i].slot, level: slots[i].level, reasons: checks[i].reasons });
      continue;
    }
    try {
      // correct option first; the bank validator then checks the full item before it is saved
      const options = [...g.options].sort((a, b) => Number(b.correct) - Number(a.correct)).map((o, k) => ({ label: "ABCD"[k], text: o.text.trim(), correct: o.correct, rationale: o.correct ? null : String(o.rationale).trim() }));
      const id = await createDraft(repo, actor, {
        skillId: String(c.skill.id), type: "MULTIPLE_CHOICE", stem: g.stem.trim(), level: slots[i].level, standardCode: String(c.standard.code),
        lessonId: c.lesson ? String(c.lesson.id) : null, whyCorrect: g.explanation.trim(), tip: g.tip ? String(g.tip).trim() : null,
        options, aiDrafted: true, cognitiveLevel: g.cognitiveLevel, batch,
      }, now);
      saved.push({ id, level: slots[i].level, stem: g.stem.trim() });
    } catch (e) {
      rejected.push({ slot: slots[i].slot, level: slots[i].level, reasons: [(e as Error).message] });
    }
  }
  const balance = balanceReport(slots, saved);
  await audit(repo, {
    actorId: actor.userId, action: "question.ai.generate", entityType: "Skill", entityId: String(c.skill.id),
    after: { batch, requested: slots.length, saved: saved.length, rejected: rejected.length, standard: ctx.standard.code, lessonId: c.lesson?.id ?? null }, at: now,
  });
  return { batch, requested: slots.length, saved, rejected, balance };
}

/** Generates only what the skill still needs to reach the target, per difficulty band. */
export async function generateMissing(repo: Repo, actor: Actor, provider: AiProvider, skillId: string, target = DEFAULT_TARGET, now = new Date()): Promise<GenerateResult | { nothingNeeded: true }> {
  assertCan(actor, "questions:generate");
  const skill = await repo.findUnique("Skill", { id: skillId });
  const cur = skill ? await repo.findUnique("Curriculum", { id: skill.curriculumId }) : null;
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!skill || !grade || grade.schoolId !== schoolOf(actor)) throw new ForbiddenError("Skill not found.");
  const row = (await skillCoverage(repo, actor, Number(grade.level), target)).find((r) => r.skillId === skillId);
  if (!row || row.needed === 0) return { nothingNeeded: true };
  // keep within one request; the next “Generate Missing” continues where this one stopped
  const byBand = { ...row.neededByBand };
  let excess = row.needed - MAX_PER_REQUEST;
  for (const b of ["medium", "easy", "hard"] as Band[]) {
    const cut = Math.min(Math.max(0, excess), byBand[b]);
    byBand[b] -= cut;
    excess -= cut;
  }
  const primary = (await repo.findMany("SkillStandard", { skillId })).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
  if (!primary) throw new ValidationError("This skill has no linked standard yet.");
  const lesson = (await repo.findMany("LessonSkill", { skillId }))[0];
  return generateQuestions(repo, actor, provider, { skillId, standardId: String(primary.standardId), lessonId: lesson ? String(lesson.lessonId) : null, byBand }, now);
}
