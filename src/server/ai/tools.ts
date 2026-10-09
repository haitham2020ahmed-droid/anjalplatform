/**
 * 🧰 The AI tools' content: what is sent (question / passage content ONLY), the prompts with the exact allowed
 * values, and strict validators for the replies. Plus the code-only checks that need no AI: answer-key
 * structure, duplicates, reading level formula, the gap report and suspicious questions (from real answers).
 */
import type { Repo, Row } from "../seeding/repo";
import { masterSkills, type MasterSkill } from "../skills/master";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { analyzeText, platformReadingLevel } from "../../reading/prl";
import type { Validator } from "./engine";

const s = (v: unknown) => String(v ?? "");
export type Level = "BELOW" | "ON" | "ABOVE";

// ------------------------------------------------------------------ question content (no student data)

export interface QItem { id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; passage: { title: string; text: string } | null; skillId: string; standardId: string | null; difficulty: number; status: string }

/** Content of these questions (any status except archived / deleted). */
export async function questionContent(repo: Repo, ids: string[]): Promise<QItem[]> {
  if (!ids.length) return [];
  const qs = (await repo.findMany("Question", { id: { in: ids }, deletedAt: null }, { select: ["id", "typeId", "stem", "passageId", "skillId", "standardId", "difficultyLevel", "status"] })).filter((q) => q.status !== "ARCHIVED");
  const [opts, types, passages] = await Promise.all([
    qs.length ? repo.findMany("QuestionOption", { questionId: { in: qs.map((q) => q.id) } }) : Promise.resolve([] as Row[]),
    repo.findMany("QuestionType", {}, { select: ["id", "code"] }),
    qs.some((q) => q.passageId) ? repo.findMany("ReadingPassage", { id: { in: [...new Set(qs.map((q) => s(q.passageId)).filter(Boolean))] } }, { select: ["id", "title", "body"] }) : Promise.resolve([] as Row[]),
  ]);
  return qs.map((q) => {
    const p = passages.find((x) => x.id === q.passageId);
    return {
      id: s(q.id), type: s(types.find((t) => t.id === q.typeId)?.code), stem: s(q.stem), skillId: s(q.skillId), standardId: q.standardId ? s(q.standardId) : null, difficulty: Number(q.difficultyLevel ?? 4), status: s(q.status),
      options: opts.filter((o) => o.questionId === q.id).sort((a, b) => Number(a.order) - Number(b.order)).map((o) => ({ label: s(o.label), text: s(o.text), correct: Boolean(o.isCorrect) })),
      passage: p ? { title: s(p.title), text: s(p.body).slice(0, 6000) } : null,
    };
  });
}

/** What the AI sees of a question: its text and options (and passage). Nothing else. */
const qPayload = (q: QItem) => ({ id: q.id, type: q.type, stem: q.stem, options: q.options.map((o) => ({ label: o.label, text: o.text })), keyedCorrect: q.options.filter((o) => o.correct).map((o) => o.label), passage: q.passage });

// ------------------------------------------------------------------ code checks (free, instant)

export interface Finding { kind: "KEY_ERROR" | "MULTIPLE_CORRECT" | "WEAK_DISTRACTOR" | "SPELLING" | "UNCLEAR"; severity: number; detail: string; data: Record<string, unknown> }
export const SEVERITY: Record<Finding["kind"], number> = { KEY_ERROR: 1, MULTIPLE_CORRECT: 1, UNCLEAR: 2, WEAK_DISTRACTOR: 3, SPELLING: 4 };

export function codeChecks(q: QItem): Finding[] {
  const out: Finding[] = [];
  if (!q.options.length) return out;
  const correct = q.options.filter((o) => o.correct);
  if (!correct.length) out.push({ kind: "KEY_ERROR", severity: 1, detail: "No option is marked correct.", data: { by: "code" } });
  if ((q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE" || q.type === "DROPDOWN") && correct.length > 1) out.push({ kind: "MULTIPLE_CORRECT", severity: 1, detail: `${correct.length} options are marked correct (${correct.map((o) => o.label).join(", ")}).`, data: { by: "code", labels: correct.map((o) => o.label) } });
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Map<string, string>();
  for (const o of q.options) { const k = norm(o.text); if (seen.has(k)) out.push({ kind: "WEAK_DISTRACTOR", severity: 2, detail: `Options ${seen.get(k)} and ${o.label} are the same.`, data: { by: "code" } }); else seen.set(k, o.label); }
  for (const o of q.options) if (!o.text.trim()) out.push({ kind: "WEAK_DISTRACTOR", severity: 2, detail: `Option ${o.label} is empty.`, data: { by: "code" } });
  return out;
}

// ------------------------------------------------------------------ Quality Check (AI)

export const QUALITY_KINDS = ["KEY_ERROR", "MULTIPLE_CORRECT", "WEAK_DISTRACTOR", "SPELLING", "UNCLEAR"] as const;
export interface QualityResult { id: string; keyIsCorrect: boolean; correctLabels: string[]; issues: { type: (typeof QUALITY_KINDS)[number]; detail: string; suggestion: string | null }[] }

export function qualityPrompt(grade: number, qs: QItem[]): { system: string; user: Record<string, unknown> } {
  return {
    system: [
      "You are a careful English Language Arts assessment editor for Grades 4–6. Check each question for quality.",
      "For each question decide: is the keyed answer (keyedCorrect) really the only correct answer? Which option labels are correct?",
      `List problems using ONLY these types: ${QUALITY_KINDS.join(", ")}.`,
      "KEY_ERROR = the keyed answer is wrong. MULTIPLE_CORRECT = more than one option is defensibly correct. WEAK_DISTRACTOR = a wrong option is obviously wrong, silly, or a giveaway (e.g. much longer). SPELLING = spelling, grammar or punctuation errors. UNCLEAR = the question is ambiguous or confusing.",
      "Be strict but fair: report only real problems. Keep each detail under 200 characters and in simple English.",
      'Return ONLY JSON: {"results":[{"id":"…","keyIsCorrect":true,"correctLabels":["B"],"issues":[{"type":"WEAK_DISTRACTOR","detail":"…","suggestion":"…"}]}]} — one result for EVERY question id, in any order.',
    ].join(" "),
    user: { task: "Quality check", grade, questions: qs.map(qPayload) },
  };
}

export function qualityValidator(qs: QItem[]): Validator<QualityResult[]> {
  return (data) => {
    const list = (data as { results?: unknown })?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: QualityResult[] = [];
    for (const raw of list) {
      const r = raw as Record<string, unknown>;
      const q = qs.find((x) => x.id === s(r.id));
      if (!q) return { ok: false, error: `unknown id “${s(r.id)}”` };
      const labels = Array.isArray(r.correctLabels) ? r.correctLabels.map(s) : null;
      if (typeof r.keyIsCorrect !== "boolean" || !labels) return { ok: false, error: `question ${q.id}: keyIsCorrect (true/false) and correctLabels (a list) are required` };
      if (q.options.length && labels.some((l) => !q.options.some((o) => o.label === l))) return { ok: false, error: `question ${q.id}: correctLabels must be among ${q.options.map((o) => o.label).join(", ")}` };
      const issues = Array.isArray(r.issues) ? r.issues : [];
      const clean: QualityResult["issues"] = [];
      for (const i of issues) {
        const t = s((i as Record<string, unknown>).type).toUpperCase();
        if (!(QUALITY_KINDS as readonly string[]).includes(t)) return { ok: false, error: `question ${q.id}: issue type “${t}” is not allowed (use ${QUALITY_KINDS.join(", ")})` };
        clean.push({ type: t as QualityResult["issues"][number]["type"], detail: s((i as Record<string, unknown>).detail).slice(0, 500), suggestion: s((i as Record<string, unknown>).suggestion).slice(0, 500) || null });
      }
      out.push({ id: q.id, keyIsCorrect: r.keyIsCorrect, correctLabels: labels, issues: clean });
    }
    return { ok: true, value: out };
  };
}

// ------------------------------------------------------------------ Auto-Tag (AI)

export interface TagContext { grade: number; skills: { code: string; title: string }[]; standards: { code: string; text: string }[]; goalAreas: string[] }
export interface TagResult { id: string; skillCode: string; standard: string; goalArea: string; level: Level; difficulty: number; confidence: number }

export async function tagContext(repo: Repo, schoolId: string, grade: number): Promise<{ ctx: TagContext; skills: MasterSkill[] }> {
  const skills = await masterSkills(repo, schoolId, { grade });
  const stds = (await repo.findMany("Standard", { gradeLevel: grade }, { select: ["code", "description", "isActive"] })).filter((x) => x.isActive !== false);
  const areas = (await repo.findMany("MapGoalArea", {}, { select: ["name"] })).map((a) => s(a.name));
  return { skills, ctx: { grade, skills: skills.map((k) => ({ code: k.code, title: k.name })), standards: stds.map((x) => ({ code: s(x.code).replace(/^CCSS\.ELA-LITERACY\./, ""), text: s(x.description).slice(0, 160) })), goalAreas: areas } };
}

export function tagPrompt(c: TagContext, qs: (QItem & { currentSkill: string; currentStandard: string | null })[]): { system: string; user: Record<string, unknown> } {
  return {
    system: [
      `You tag Grade ${c.grade} English Language Arts questions. For each question choose:`,
      "skillCode (ONLY from allowed.skills codes), standard (ONLY from allowed.standards codes, e.g. RL.4.3), goalArea (ONLY from allowed.goalAreas),",
      "level (BELOW, ON or ABOVE for this grade), difficulty (a whole number 1–7: 1–3 below grade level, 4 on grade level, 5–7 above), confidence (0 to 1).",
      "Keep the current skill and standard when they fit. Never invent codes.",
      'Return ONLY JSON: {"results":[{"id":"…","skillCode":"…","standard":"RL.4.3","goalArea":"…","level":"ON","difficulty":4,"confidence":0.8}]} — one result for EVERY question id.',
    ].join(" "),
    user: { task: "Tag questions", grade: c.grade, allowed: { skills: c.skills, standards: c.standards, goalAreas: c.goalAreas, levels: ["BELOW", "ON", "ABOVE"] }, questions: qs.map((q) => ({ ...qPayload(q), currentSkill: q.currentSkill, currentStandard: q.currentStandard })) },
  };
}

export function tagValidator(c: TagContext, qs: QItem[]): Validator<TagResult[]> {
  const skills = new Set(c.skills.map((k) => k.code)), stds = new Set(c.standards.map((x) => x.code)), areas = new Set(c.goalAreas);
  return (data) => {
    const list = (data as { results?: unknown })?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: TagResult[] = [];
    for (const raw of list) {
      const r = raw as Record<string, unknown>;
      if (!qs.some((q) => q.id === s(r.id))) return { ok: false, error: `unknown id “${s(r.id)}”` };
      const std = s(r.standard).replace(/^CCSS\.ELA-LITERACY\./, "");
      if (!skills.has(s(r.skillCode))) return { ok: false, error: `question ${s(r.id)}: skillCode “${s(r.skillCode)}” is not in allowed.skills` };
      if (!stds.has(std)) return { ok: false, error: `question ${s(r.id)}: standard “${std}” is not in allowed.standards` };
      if (!areas.has(s(r.goalArea))) return { ok: false, error: `question ${s(r.id)}: goalArea “${s(r.goalArea)}” is not in allowed.goalAreas` };
      const level = s(r.level).toUpperCase();
      if (!["BELOW", "ON", "ABOVE"].includes(level)) return { ok: false, error: `question ${s(r.id)}: level must be BELOW, ON or ABOVE` };
      const d = Number(r.difficulty);
      if (!(Number.isInteger(d) && d >= 1 && d <= 7)) return { ok: false, error: `question ${s(r.id)}: difficulty must be a whole number 1–7` };
      const conf = Math.max(0, Math.min(1, Number(r.confidence ?? 0.5) || 0.5));
      out.push({ id: s(r.id), skillCode: s(r.skillCode), standard: std, goalArea: s(r.goalArea), level: level as Level, difficulty: d, confidence: conf });
    }
    return { ok: true, value: out };
  };
}

// ------------------------------------------------------------------ Reading level (formula + AI)

export interface PItem { id: string; title: string; text: string; genre: string | null }
export interface ReadingResult { id: string; gradeLevel: number; band: Level; reason: string }

/** The free formula: Flesch–Kincaid grade level (an ESTIMATED reading level — not a Lexile). */
export function formulaLevel(text: string, grade: number): { gradeLevel: number; band: Level } {
  const st = analyzeText(text);
  const fk = Math.round(((platformReadingLevel(st) - 100) / 100) * 10) / 10;
  return { gradeLevel: fk, band: fk < grade - 0.5 ? "BELOW" : fk > grade + 1 ? "ABOVE" : "ON" };
}

export function readingPrompt(grade: number, ps: PItem[]): { system: string; user: Record<string, unknown> } {
  return {
    system: [
      "You estimate the reading level of English texts for Grade 4–6 learners (many are English language learners).",
      "Consider vocabulary, sentence length and structure, background knowledge and text structure.",
      `For each passage give gradeLevel (a number like 4.5, US school grade) and band compared with Grade ${grade}: BELOW, ON or ABOVE, and a one-sentence reason.`,
      'Return ONLY JSON: {"results":[{"id":"…","gradeLevel":4.5,"band":"ON","reason":"…"}]} — one result for EVERY passage id.',
    ].join(" "),
    user: { task: "Estimate reading level", grade, passages: ps.map((p) => ({ id: p.id, title: p.title, genre: p.genre, text: p.text.slice(0, 6000) })) },
  };
}

export function readingValidator(ps: PItem[]): Validator<ReadingResult[]> {
  return (data) => {
    const list = (data as { results?: unknown })?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: ReadingResult[] = [];
    for (const raw of list) {
      const r = raw as Record<string, unknown>;
      if (!ps.some((p) => p.id === s(r.id))) return { ok: false, error: `unknown id “${s(r.id)}”` };
      const g = Number(r.gradeLevel), band = s(r.band).toUpperCase();
      if (!(Number.isFinite(g) && g >= 0 && g <= 14)) return { ok: false, error: `passage ${s(r.id)}: gradeLevel must be a number 0–14` };
      if (!["BELOW", "ON", "ABOVE"].includes(band)) return { ok: false, error: `passage ${s(r.id)}: band must be BELOW, ON or ABOVE` };
      out.push({ id: s(r.id), gradeLevel: Math.round(g * 10) / 10, band: band as Level, reason: s(r.reason).slice(0, 300) });
    }
    return { ok: true, value: out };
  };
}

// ------------------------------------------------------------------ Duplicate Finder (code)

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
export function similarity(a: string, b: string): number {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Identical or very similar questions (stem + options), across sections; the pair's “keep” is the older one. */
export async function findDuplicates(repo: Repo, ids: string[], threshold = 0.85): Promise<{ a: string; b: string; score: number; stemA: string; stemB: string }[]> {
  const qs = await questionContent(repo, ids);
  const text = (q: QItem) => `${q.stem} ${q.options.map((o) => o.text).join(" ")}`;
  const prepared = qs.map((q) => ({ q, set: new Set(words(text(q))), exact: q.stem.toLowerCase().replace(/\s+/g, " ").trim() }));
  const out: { a: string; b: string; score: number; stemA: string; stemB: string }[] = [];
  for (let i = 0; i < prepared.length; i++) for (let j = i + 1; j < prepared.length; j++) {
    const x = prepared[i], y = prepared[j];
    if (Math.abs(x.set.size - y.set.size) > Math.max(x.set.size, y.set.size) * (1 - threshold) + 2) continue;
    let inter = 0; for (const w of x.set) if (y.set.has(w)) inter++;
    const score = x.exact === y.exact && x.q.passage?.title === y.q.passage?.title ? 1 : inter / (x.set.size + y.set.size - inter || 1);
    if (score >= threshold) out.push({ a: x.q.id, b: y.q.id, score: Math.round(score * 100) / 100, stemA: x.q.stem.slice(0, 200), stemB: y.q.stem.slice(0, 200) });
  }
  return out.sort((p, q) => q.score - p.score);
}

// ------------------------------------------------------------------ Gap Report (code)

export const TARGETS = { SKILL: 20, GRAMMAR: 10, CV_PLACE: 25 } as const;
export interface GapRow { kind: "SKILL" | "GRAMMAR" | "CV"; id: string; name: string; perLevel: number | null; counts: Record<Level, number>; total: number; target: number; missing: Record<Level, number> | null; missingTotal: number }

/** Questions per skill per level against the targets (60 per skill = 20 per level; Grammar 30 = 10 per level;
 *  Concept Vocabulary 25 per selection). Published questions only. */
export async function gapReport(repo: Repo, schoolId: string, grade: number, skillId?: string): Promise<GapRow[]> {
  const skills = (await masterSkills(repo, schoolId, { grade })).filter((k) => !skillId || k.id === skillId);
  const qs = skills.length ? await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["id", "skillId", "difficultyLevel"] }) : [];
  const links = qs.length ? await repo.findMany("QuestionMapLink", { questionId: { in: qs.map((q) => q.id) } }) : [];
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "level", "code", "categoryType", "title", "parentId"] }) : [];
  const levelOf = (q: Row): Level => { const n = nodes.find((x) => x.id === links.find((l) => l.questionId === q.id)?.nodeId); return (n?.level ? s(n.level) : fromDifficulty(Number(q.difficultyLevel ?? 4))) as Level; };
  const rows: GapRow[] = skills.map((k) => {
    const per = k.kind === "GRAMMAR" ? TARGETS.GRAMMAR : TARGETS.SKILL;
    const counts: Record<Level, number> = { BELOW: 0, ON: 0, ABOVE: 0 };
    for (const q of qs.filter((x) => x.skillId === k.id)) counts[levelOf(q)]++;
    const missing = { BELOW: Math.max(0, per - counts.BELOW), ON: Math.max(0, per - counts.ON), ABOVE: Math.max(0, per - counts.ABOVE) };
    return { kind: k.kind === "GRAMMAR" ? "GRAMMAR" : "SKILL", id: k.id, name: k.name, perLevel: per, counts, total: counts.BELOW + counts.ON + counts.ABOVE, target: per * 3, missing, missingTotal: missing.BELOW + missing.ON + missing.ABOVE };
  });
  if (!skillId) {
    // Concept Vocabulary selections (no levels): 25 questions each
    const g = (await repo.findMany("Grade", { schoolId, level: grade }))[0];
    const cv = g ? (await repo.findMany("CurriculumMapNode", { gradeId: g.id, categoryType: "CONCEPT_VOCABULARY" }, { select: ["id", "code", "parentId"] })) : [];
    const cvLinks = cv.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: cv.map((n) => n.id) } }) : [];
    const published = cvLinks.length ? new Set((await repo.findMany("Question", { id: { in: cvLinks.map((l) => l.questionId) }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => s(q.id))) : new Set<string>();
    const parents = cv.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(cv.map((n) => s(n.parentId)))] } }, { select: ["id", "heading", "title"] }) : [];
    for (const n of cv) {
      const total = cvLinks.filter((l) => l.nodeId === n.id && published.has(s(l.questionId))).length;
      const p = parents.find((x) => x.id === n.parentId);
      rows.push({ kind: "CV", id: s(n.code), name: `Concept Vocabulary · ${s(p?.heading ?? p?.title)} (${s(n.code)})`, perLevel: null, counts: { BELOW: 0, ON: total, ABOVE: 0 }, total, target: TARGETS.CV_PLACE, missing: null, missingTotal: Math.max(0, TARGETS.CV_PLACE - total) });
    }
  }
  return rows.sort((a, b) => b.missingTotal - a.missingTotal || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ Suspicious questions (code, from real answers)

export interface Suspicious { id: string; stem: string; answers: number; correctPct: number; strongAnswers: number; strongCorrectPct: number | null; key: string; topWrong: { label: string; count: number } | null; keyCount: number; reasons: string[] }

/** Questions where most students are wrong — strong students too — or a wrong option beats the keyed answer. */
export async function suspiciousQuestions(repo: Repo, schoolId: string, opts: { minAnswers?: number; grade?: number } = {}): Promise<Suspicious[]> {
  const min = opts.minAnswers ?? 10;
  const skills = await masterSkills(repo, schoolId, opts.grade ? { grade: opts.grade } : {});
  if (!skills.length) return [];
  const attempts = await repo.findMany("QuestionAttempt", { skillId: { in: skills.map((k) => k.id) } }, { select: ["questionId", "studentId", "isCorrect", "response", "rapidGuess"] });
  const careful = attempts.filter((a) => !a.rapidGuess);
  const byQ = new Map<string, Row[]>();
  for (const a of careful) byQ.set(s(a.questionId), [...(byQ.get(s(a.questionId)) ?? []), a]);
  const candidates = [...byQ.entries()].filter(([, v]) => v.length >= min).map(([k]) => k);
  if (!candidates.length) return [];
  // strong students: Above Level, or 80%+ correct overall (min 20 answers)
  const studentIds = [...new Set(careful.map((a) => s(a.studentId)))];
  const levels = await repo.findMany("StudentLevel", { studentId: { in: studentIds } }, { select: ["studentId", "level"] });
  const total = new Map<string, { n: number; c: number }>();
  for (const a of careful) { const t = total.get(s(a.studentId)) ?? { n: 0, c: 0 }; t.n++; if (a.isCorrect) t.c++; total.set(s(a.studentId), t); }
  const strong = new Set([...levels.filter((l) => l.level === "ABOVE").map((l) => s(l.studentId)), ...[...total.entries()].filter(([, t]) => t.n >= 20 && t.c / t.n >= 0.8).map(([id]) => id)]);
  const qs = await questionContent(repo, candidates);
  const out: Suspicious[] = [];
  for (const q of qs) {
    const list = byQ.get(q.id) ?? [];
    const right = list.filter((a) => a.isCorrect).length, pct = Math.round((right / list.length) * 100);
    const st = list.filter((a) => strong.has(s(a.studentId))), stPct = st.length ? Math.round((st.filter((a) => a.isCorrect).length / st.length) * 100) : null;
    const counts = new Map<string, number>();
    for (const a of list) { let r: unknown = a.response; if (typeof r === "string") { try { r = JSON.parse(r); } catch { /* a plain label */ } }
      const v = r && typeof r === "object" ? (r as Record<string, unknown>).value ?? (r as Record<string, unknown>).choice : r;
      const label = typeof v === "string" && q.options.some((o) => o.label === v) ? v : null; if (label) counts.set(label, (counts.get(label) ?? 0) + 1); }
    const key = q.options.filter((o) => o.correct).map((o) => o.label).join(",");
    const keyCount = q.options.filter((o) => o.correct).reduce((t, o) => t + (counts.get(o.label) ?? 0), 0);
    const wrong = [...counts.entries()].filter(([l]) => !q.options.some((o) => o.correct && o.label === l)).sort((a, b) => b[1] - a[1])[0];
    const reasons: string[] = [];
    if (pct < 35 && stPct !== null && st.length >= 3 && stPct < 50) reasons.push(`Most students are wrong (${pct}% correct) — strong students too (${stPct}%).`);
    else if (pct < 25) reasons.push(`Most students are wrong (${pct}% correct).`);
    if (wrong && wrong[1] > keyCount && keyCount + wrong[1] >= min / 2) reasons.push(`Option ${wrong[0]} is chosen more often (${wrong[1]}) than the keyed answer ${key} (${keyCount}).`);
    if (reasons.length) out.push({ id: q.id, stem: q.stem.slice(0, 240), answers: list.length, correctPct: pct, strongAnswers: st.length, strongCorrectPct: stPct, key, topWrong: wrong ? { label: wrong[0], count: wrong[1] } : null, keyCount, reasons });
  }
  return out.sort((a, b) => a.correctPct - b.correctPct);
}
