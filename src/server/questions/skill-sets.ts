/**
 * ➕ School-supplied MAP-style skill sets (data/questions/sets/map-skill-sets.json: Persuasive Techniques, Rhetorical
 * Questions). For each set: the skill is created in Grades 4, 5 and 6 (one family, one question pool) when missing,
 * and its questions are added to the bank under the Grade 5 skill (or the school's middle grade), PUBLISHED (the
 * school asked for them on the platform). Safe to run again: a question already in the bank is skipped.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { createSkill } from "../curriculum-manage";
import { createDraft, saveMapArea } from "../admin/questions";
import { libraryActor } from "../readmaster/library";
import { RIT_MEAN, RIT_SD, ritOf, THETA_PER_RIT } from "./bank-scope";
import type { Grid, HotText, TwoPart } from "@/imports/questions/validate";
import { normalizeSkillName } from "./skill-questions";

const s = (v: unknown) => String(v ?? "");
const LEVEL: Record<string, number> = { BELOW: 2, ON: 4, ABOVE: 6 };
/** the authored levels of a gap question read at the grade it was written for (Below 3 · On 4 · Above 5) */
const LEVEL_DIFF: Record<string, number> = { BELOW: 3, ON: 4, ABOVE: 5 };

export interface SetQuestion {
  ref: string; anchor?: string; level: string; passageTitle?: string | null; passage?: string | null; stem: string; options?: string[]; correct?: string; why: string;
  /** gap sets (Update 54): the grade the question was written for (4–12), its DOK and its MAP test / area */
  grade?: number; dok?: number; mapTest?: string; mapArea?: string;
  /**
   * 🧩 MAP-style answer types (Update 56). Leave out = MULTIPLE_CHOICE (options + correct "B").
   * MULTI_SELECT / DROPDOWN: options + correct ("AC" for several). TWO_PART: twoPart. HOT_TEXT: hotText.
   * GRID: grid. MATCHING: pairs. SENTENCE_ORDER: sequence (in the right order). ERROR_CORRECTION: segments + errorIndex
   * + correction. TRUE_FALSE: answer.
   */
  type?: SetType;
  /** compact files: the id of the question's passage in the file's "passages" table */
  passageRef?: string;
  pairs?: { left: string; right: string }[];
  sequence?: string[];
  twoPart?: TwoPart;
  grid?: Grid;
  hotText?: HotText;
  segments?: string[];
  errorIndex?: number;
  correction?: string;
  answer?: boolean;
}
export type SetType = "MULTIPLE_CHOICE" | "MULTI_SELECT" | "DROPDOWN" | "TWO_PART" | "HOT_TEXT" | "GRID" | "MATCHING" | "SENTENCE_ORDER" | "ERROR_CORRECTION" | "TRUE_FALSE";
const CHOICE_TYPES = new Set<SetType>(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"]);
const SET_TYPES = new Set<string>(["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN", "TWO_PART", "HOT_TEXT", "GRID", "MATCHING", "SENTENCE_ORDER", "ERROR_CORRECTION", "TRUE_FALSE"]);
/** The question's type: older files say "Multiple Choice" (a label) — anything that is not a type code is multiple choice. */
const typeOf = (q: SetQuestion): SetType => { const t = String(q.type ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_"); return (SET_TYPES.has(t) ? t : "MULTIPLE_CHOICE") as SetType; };

/** The editor fields of a set question's type (options for choice types; the type's own shape for the others). */
export function typeFields(q: SetQuestion): Record<string, unknown> {
  const type = typeOf(q);
  if (CHOICE_TYPES.has(type)) {
    const right = new Set(s(q.correct).toUpperCase().replace(/[^A-Z]/g, "").split(""));
    if (!right.size) throw new Error("no correct answer");
    const options = (q.options ?? []).map((text, i) => {
      const label = String.fromCharCode(65 + i), ok = right.has(label);
      return { label, text: s(text), correct: ok, rationale: ok ? null : "Read the text again." };
    });
    if ([...right].some((l) => !options.some((o) => o.label === l))) throw new Error("the correct answer is not an option");
    return { type, options };
  }
  switch (type) {
    case "TWO_PART": return { type, twoPart: q.twoPart };
    case "HOT_TEXT": return { type, hotText: q.hotText };
    case "GRID": return { type, grid: q.grid };
    case "MATCHING": return { type, pairs: q.pairs };
    case "SENTENCE_ORDER": return { type, sequence: q.sequence };
    case "ERROR_CORRECTION": return { type, segments: q.segments, errorIndex: q.errorIndex, correction: q.correction };
    case "TRUE_FALSE": return { type, answer: q.answer };
  }
  throw new Error(`unknown type ${type}`);
}

/** What makes two questions with the same text different: their right answer (any type). */
export function answerText(q: SetQuestion): string {
  const type = typeOf(q);
  if (CHOICE_TYPES.has(type)) {
    const right = s(q.correct).toUpperCase().replace(/[^A-Z]/g, "").split("");
    return right.map((l) => s(q.options?.[l.charCodeAt(0) - 65])).join(" ");
  }
  if (type === "TWO_PART") return (q.twoPart?.partA.options ?? []).filter((o) => o.correct).map((o) => o.text).join(" ");
  if (type === "HOT_TEXT") return (q.hotText?.segments ?? []).filter((x) => q.hotText?.correct.includes(x.id)).map((x) => x.text).join(" ");
  if (type === "GRID") return JSON.stringify(q.grid?.answer ?? {});
  if (type === "MATCHING") return (q.pairs ?? []).map((p) => p.left + p.right).join(" ");
  if (type === "SENTENCE_ORDER") return (q.sequence ?? []).join(" ");
  if (type === "ERROR_CORRECTION") return s(q.correction);
  return s(q.answer);
}
export interface SkillSet {
  skill: string; questions: SetQuestion[];
  /** gap sets: the skill's home grade, CCSS code and bank domain (Reading Informational Text, Vocabulary, …) */
  grade?: number; ccss?: string; domain?: string; mapArea?: string;
}
export interface SetResult { skill: string; skillsCreated: number; added: number; skipped: number; errors: string[] }

export async function loadSkillSetsFile(file = "map-skill-sets.json"): Promise<SkillSet[]> {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const raw = JSON.parse(await readFile(resolve(process.cwd(), "data", "questions", "sets", file), "utf8")) as { sets: SkillSet[]; passages?: Record<string, { title: string; text: string }> };
  return withPassages(raw.sets ?? [], raw.passages);
}

/** Compact files keep each passage once ("passages" + passageRef on the question): put the text back on the question. */
export function withPassages<T extends { questions: SetQuestion[] }>(sets: T[], passages?: Record<string, { title: string; text: string }>): T[] {
  if (!passages) return sets;
  for (const set of sets) for (const q of set.questions) {
    const p = q.passageRef ? passages[q.passageRef] : undefined;
    if (p) { q.passageTitle = p.title; q.passage = p.text; }
  }
  return sets;
}

/** The platform's domain / category of a set's bank domain (Reading Literature → READING · LITERATURE, …). */
export function domainOf(set: SkillSet): { domain: string; category: string } {
  const d = s(set.domain).toLowerCase(), area = s(set.mapArea).toLowerCase();
  if (d.includes("literature")) return { domain: "READING", category: "LITERATURE" };
  if (d.includes("vocabulary")) return { domain: "VOCABULARY", category: "VOCABULARY" };
  if (d.includes("writing")) return { domain: "WRITING", category: "WRITING" };
  if (d.includes("grammar")) return area.includes("mechanic") ? { domain: "LANGUAGE", category: "MECHANICS" } : { domain: "GRAMMAR", category: "GRAMMAR" };
  return { domain: "READING", category: "INFORMATIONAL" };
}

/** "RL.8.6" / "RI.9-10.8" / "L.4.4.b" → the same standard in grade g (RL.g.6, RI.g.8, L.g.4) when stored. */
export function standardInGrade(code: string, g: number, stored: Map<string, string>): string | null {
  const m = /^([A-Z]+)\.(?:K|\d{1,2}(?:-\d{1,2})?)\.(\d{1,2})/i.exec(s(code).trim());
  return m ? stored.get(`${m[1].toUpperCase()}.${g}.${m[2]}`) ?? null : null;
}

/** "CCRA.R.8" + grade 5 → the stored code of RI.5.8 (informational reading). */
function standardFor(anchor: string, grade: number, stored: Map<string, string>): string | null {
  const n = /R\.(\d+)/i.exec(anchor)?.[1];
  return n ? stored.get(`RI.${grade}.${n}`) ?? null : null;
}

export interface AddSetOptions {
  /** 📏 top-up (Update 55): add to the skill that already exists (never create one), at most `max[skill]` questions */
  onlyExisting?: boolean;
  max?: Map<string, number>;
}

/** Below / On / Above taken in turn (B, O, A, B, O, A…) so a partial top-up stays balanced across levels. */
export function balancedOrder<T extends { level: string }>(qs: T[]): T[] {
  const by = (lv: string) => qs.filter((q) => s(q.level).toUpperCase() === lv);
  const lists = [by("BELOW"), by("ON"), by("ABOVE")], out: T[] = [];
  for (let i = 0; out.length < qs.length && i < qs.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export async function addSkillSets(repo: Repo, schoolId: string, sets: SkillSet[], actorIn?: Actor, now = new Date(), opts: AddSetOptions = {}): Promise<SetResult[]> {
  const actor = actorIn ?? (await libraryActor(repo, schoolId));
  const grades = (await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] })).filter((g) => [4, 5, 6].includes(Number(g.level)));
  const stored = new Map((await repo.findMany("Standard", {}, { select: ["code"] })).map((x) => [s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase(), s(x.code)]));
  const out: SetResult[] = [];
  for (const set of sets) {
    // gap sets: the home grade nearest the set's own grade (4–6); the school's MAP sets keep Grade 5
    const want = set.grade ? Math.max(4, Math.min(6, set.grade)) : 5;
    const home = grades.find((g) => Number(g.level) === want) ?? grades.find((g) => Number(g.level) === 5) ?? grades[0];
    const r: SetResult = { skill: set.skill, skillsCreated: 0, added: 0, skipped: 0, errors: [] };
    let homeSkillId: string | null = null;
    let homeLevel: number | null = null;
    const found: { id: string; level: number }[] = [];
    // the same skill whatever its case, "&" / "and" or apostrophe ("Character Traits & Development", "A Speaker’s …")
    const wantName = normalizeSkillName(set.skill);
    for (const g of grades) {
      const cur = (await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] }))[0];
      if (!cur) continue;
      const have = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "name"] })).find((k) => normalizeSkillName(s(k.name)) === wantName);
      let id = have ? s(have.id) : null;
      if (!id && !opts.onlyExisting) {
        const level = Number(g.level);
        const codes = set.ccss ? [standardInGrade(set.ccss, level, stored)].filter((c): c is string => Boolean(c)) : [`RI.${level}.6`, `RI.${level}.8`].filter((c) => stored.has(c));
        const dc = set.domain ? domainOf(set) : { domain: "READING", category: "INFORMATIONAL" };
        try { id = s((await createSkill(repo, actor, { gradeId: s(g.id), name: set.skill, domain: dc.domain, category: dc.category, standardCodes: codes, confirmDuplicate: true })).id); r.skillsCreated++; }
        catch (e) { r.errors.push(`Grade ${level}: ${(e as Error).message}`); }
      }
      if (id && home && g.id === home.id) homeSkillId = id;
      if (id && opts.onlyExisting) found.push({ id, level: Number(g.level) });
    }
    // top-up: the existing copy nearest the set's own grade
    if (opts.onlyExisting) {
      const best = found.sort((a, b) => Math.abs(a.level - want) - Math.abs(b.level - want))[0];
      homeSkillId = best?.id ?? null; homeLevel = best?.level ?? null;
      if (!homeSkillId) { r.errors.push("The skill is not on this school's platform (nothing added)."); out.push(r); continue; }
    }
    if (!homeSkillId) { r.errors.push("No Grade 4–6 skill to add the questions to."); out.push(r); continue; }
    const grade = homeLevel ?? Number(home!.level);
    const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // top-up: an existing question with the same text AND the same answer is the same question (a common stem such as
    // "Which sentence is correct?" with other choices is a different one)
    const existing = await repo.findMany("Question", { skillId: homeSkillId, deletedAt: null }, { select: ["id", "stem"] });
    let have = new Set(existing.map((x) => key(s(x.stem))));
    if (opts.onlyExisting && existing.length) {
      const right = await repo.findMany("QuestionOption", { questionId: { in: existing.map((x) => x.id) }, isCorrect: true }, { select: ["questionId", "label", "text"] });
      const ans = new Map<string, string[]>();
      for (const o of right.sort((a, b) => s(a.label).localeCompare(s(b.label)))) ans.set(s(o.questionId), [...(ans.get(s(o.questionId)) ?? []), s(o.text)]);
      // a question without choices (two-part, grid, matching…): its text alone identifies it
      have = new Set(existing.map((x) => ans.has(s(x.id)) ? `${key(s(x.stem))}|${key(ans.get(s(x.id))!.join(" "))}` : `${key(s(x.stem))}|*`));
    }
    const cap = opts.max?.get(set.skill) ?? Infinity;
    const added = new Set<string>();
    // ⚡ the questions are created first, then analysed together (one saveMapArea pass for the set, not one per
    // question), then published — each question still goes create → analyse → publish, as before
    const made: { qid: string; data: Row }[] = [];
    for (const q of opts.onlyExisting ? balancedOrder(set.questions) : set.questions) {
      if (r.added >= cap) break;
      const k2 = `${key(q.stem)}|${key(s(q.passageTitle))}`;
      const answerKey = `${key(q.stem)}|${key(answerText(q))}`;
      const same = opts.onlyExisting ? have.has(answerKey) || have.has(`${key(q.stem)}|*`) : have.has(key(q.stem));
      if (same || added.has(k2)) { r.skipped++; continue; }
      try {
        const fields = typeFields(q);
        const std = set.ccss ? standardInGrade(q.anchor || set.ccss, grade, stored) : standardFor(s(q.anchor), grade, stored);
        // 🏦 grade-free level: a question written for another grade (e.g. Grade 9) keeps its real difficulty on the
        // RIT scale; it is stored under the home grade with the level that matches that RIT
        const written = q.grade && q.grade !== grade ? q.grade : null;
        const rit = ritOf(LEVEL_DIFF[s(q.level).toUpperCase()] ?? 4, q.grade ?? grade);
        const level = written ? Math.max(1, Math.min(7, Math.round(4 + (3 * (rit - (RIT_MEAN[grade] ?? 205))) / RIT_SD))) : LEVEL[s(q.level).toUpperCase()] ?? 4;
        const qid = await createDraft(repo, actor, {
          skillId: homeSkillId, stem: q.stem, level, whyCorrect: q.why, ...fields,
          ...(q.passage ? { passageText: q.passageTitle ? `${q.passageTitle}\n\n${q.passage}` : q.passage } : {}),
          ...(std ? { standardCode: std } : {}),
        } as never, now, { deferAnalysis: true });
        made.push({ qid, data: {
          status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId,
          // gap sets: the exact difficulty on the engine's scale (not clamped to 1–7), its MAP test / area and DOK
          ...(written ? { irtB: Math.round((rit - (RIT_MEAN[grade] ?? 205)) * THETA_PER_RIT * 100) / 100, tags: { rit: { value: rit, source: "GAP_SET" } } } : {}),
          ...(q.mapTest ? { mapTest: q.mapTest.slice(0, 20) } : {}), ...(q.mapArea ? { mapInstructionalArea: q.mapArea.slice(0, 80), mapAreaSource: "IMPORT" } : {}),
          ...(q.dok ? { dok: q.dok, dokSource: "IMPORT" } : {}),
        } });
        added.add(k2); r.added++;
      } catch (e) {
        if (/already exists|duplicate/i.test((e as Error).message)) r.skipped++;
        else r.errors.push(`${q.ref}: ${(e as Error).message}`);
      }
    }
    await analyseAndPublish(repo, schoolId, made, now);
    out.push(r);
  }
  return out;
}

/**
 * ⚡ After a batch of createDraft(…, { deferAnalysis: true }): the area / skill / tag / intelligence pass once for the
 * whole batch (saveMapArea never throws for an input without a MAP area), then each question's publish update —
 * questions with the same update share one statement.
 */
export async function analyseAndPublish(repo: Repo, schoolId: string, made: { qid: string; data: Row }[], now: Date): Promise<void> {
  if (!made.length) return;
  await saveMapArea(repo, schoolId, made.map((m) => m.qid), {}, now);
  const same = new Map<string, { data: Row; ids: string[] }>();
  for (const m of made) {
    const k = JSON.stringify(m.data);
    const g = same.get(k);
    if (g) g.ids.push(m.qid); else same.set(k, { data: m.data, ids: [m.qid] });
  }
  for (const g of same.values()) for (let i = 0; i < g.ids.length; i += 500) {
    const part = g.ids.slice(i, i + 500);
    await repo.updateMany("Question", { id: part.length === 1 ? part[0] : { in: part } }, g.data);
  }
}
