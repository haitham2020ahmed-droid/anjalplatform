/**
 * 🧭 UI reorg Phase 1 — NAFS (the national test) linked to the question bank exactly like MAP.
 *
 *   NafsArea          the admin-editable list of NAFS English areas (stored as data; five to start with)
 *   NafsSkillLink     skill family (one master skill across grades) → NAFS area. AUTO links are seeded from the
 *                     family's category / domain, its MAP goal area and its CCSS standards; a link the admin sets on
 *                     /admin/nafs-links is ADMIN and is never changed automatically
 *   NafsQuestionArea  a question's own NAFS area (an explicit override of its skill's)
 *
 * A family the rules cannot place confidently gets NO link: it goes to the “needs review” list (SkillLinkReview,
 * kind FAMILY_NAFS) — never a silent guess.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertCanEditSharedCatalogue } from "../curriculum-manage";
import { isHiddenSkill } from "../skills/master";
import { countQuestionsOfSkills, schoolSkillIndex } from "../questions/skill-questions";

const s = (v: unknown) => String(v ?? "");
const on = (v: unknown) => v !== false && v !== 0;

export type NafsCode = "RC_LIT" | "RC_INFO" | "VOCAB" | "GRAMMAR" | "WRITING";
/** The starting list (the admin may rename, add or switch off areas: they are data). */
export const NAFS_DEFAULT_AREAS: { code: NafsCode; name: string }[] = [
  { code: "RC_LIT", name: "Reading Comprehension: Literary" },
  { code: "RC_INFO", name: "Reading Comprehension: Informational" },
  { code: "VOCAB", name: "Vocabulary" },
  { code: "GRAMMAR", name: "Grammar & Language Use" },
  { code: "WRITING", name: "Writing & Mechanics" },
];
/** Below this, a decision is not applied: it is listed for an admin to review. */
export const LINK_CONFIDENCE = 0.8;

/** Creates the starting areas that are missing (never renames or removes one). */
export async function ensureNafsAreas(repo: Repo): Promise<number> {
  const have = new Set((await repo.findMany("NafsArea", {}, { select: ["code"] })).map((a) => s(a.code)));
  let n = 0;
  for (const [i, a] of NAFS_DEFAULT_AREAS.entries()) if (!have.has(a.code)) { await repo.create("NafsArea", { code: a.code, name: a.name, sortOrder: i + 1, isActive: true }); n++; }
  return n;
}

export interface NafsArea { id: string; code: string; name: string; sortOrder: number; isActive: boolean }
export async function nafsAreas(repo: Repo, opts: { activeOnly?: boolean } = {}): Promise<NafsArea[]> {
  const rows = await repo.findMany("NafsArea", {}, { select: ["id", "code", "name", "sortOrder", "isActive"] });
  return rows.map((a) => ({ id: s(a.id), code: s(a.code), name: s(a.name), sortOrder: Number(a.sortOrder ?? 0), isActive: on(a.isActive) }))
    .filter((a) => !opts.activeOnly || a.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ the rule (pure)

export interface FamilyFacts { code: string; name: string; domain: string; category: string; mapArea: string | null; standards: string[] }
export interface NafsDecision { area: NafsCode | null; confidence: number; reason: string }

/**
 * Skill family → NAFS area, in this order of trust: its category / domain (Grammar, Mechanics, Writing, Vocabulary,
 * Literature, Informational), then — for general comprehension skills — its MAP goal area, then its standards
 * (only RL → Literary, only RI → Informational). A comprehension skill with RL and RI and no MAP area is not decided.
 */
export function nafsRuleForFamily(f: FamilyFacts): NafsDecision {
  const cat = f.category.toUpperCase(), dom = f.domain.toUpperCase(), map = (f.mapArea ?? "").toUpperCase();
  if (cat === "GRAMMAR" || dom === "GRAMMAR") return { area: "GRAMMAR", confidence: 0.95, reason: "grammar skill" };
  if (cat === "MECHANICS") return { area: "WRITING", confidence: 0.95, reason: "mechanics skill (capitals, punctuation, spelling)" };
  if (cat === "WRITING" || dom === "WRITING") return { area: "WRITING", confidence: 0.95, reason: "writing skill" };
  if (["VOCABULARY", "WORD_STUDY", "PHONICS_WORD_STUDY"].includes(cat) || dom === "VOCABULARY" || dom === "WORD_STUDY") return { area: "VOCAB", confidence: 0.95, reason: "vocabulary / word study skill" };
  if (dom === "LANGUAGE") return map === "LANG_MECHANICS" ? { area: "WRITING", confidence: 0.9, reason: "language skill with the MAP area Mechanics" } : { area: "GRAMMAR", confidence: 0.85, reason: "language skill" };
  if (cat === "LITERATURE") return { area: "RC_LIT", confidence: 0.95, reason: "literature skill" };
  if (cat === "INFORMATIONAL") return { area: "RC_INFO", confidence: 0.95, reason: "informational-text skill" };
  // comprehension (reading in general): the MAP goal area, then the standards
  if (map.startsWith("LIT_")) return { area: "RC_LIT", confidence: 0.85, reason: "comprehension skill; MAP goal area Literary Text" };
  if (map.startsWith("INFO_")) return { area: "RC_INFO", confidence: 0.85, reason: "comprehension skill; MAP goal area Informational Text" };
  if (map === "VOCAB") return { area: "VOCAB", confidence: 0.85, reason: "MAP goal area Vocabulary" };
  if (map === "LANG_GRAMMAR") return { area: "GRAMMAR", confidence: 0.85, reason: "MAP goal area Grammar and Usage" };
  if (map === "LANG_MECHANICS" || map.startsWith("WRITING")) return { area: "WRITING", confidence: 0.85, reason: "MAP goal area Writing / Mechanics" };
  const std = f.standards.map((c) => c.replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase());
  const rl = std.some((c) => c.startsWith("RL.")), ri = std.some((c) => c.startsWith("RI."));
  if (rl && !ri) return { area: "RC_LIT", confidence: 0.85, reason: "comprehension skill with literature standards (RL)" };
  if (ri && !rl) return { area: "RC_INFO", confidence: 0.85, reason: "comprehension skill with informational standards (RI)" };
  if (std.some((c) => c.startsWith("L."))) return { area: "GRAMMAR", confidence: 0.6, reason: "language standard only (could be vocabulary or grammar)" };
  if (rl && ri) return { area: "RC_LIT", confidence: 0.5, reason: "comprehension skill with both RL and RI standards and no MAP goal area" };
  return { area: null, confidence: 0, reason: "no category, MAP goal area or standard to decide from" };
}

// ------------------------------------------------------------------ seeding (the link script and new imports)

export interface FamilyRow { familyId: string; code: string; family: string; skillIds: string[]; skills: string[]; grades: number[]; mapArea: string | null; standards: string[]; domain: string; category: string; nafsAreaId: string | null; nafsSource: string | null }

/** The school's skill families (not the hidden holding skill) with what the rules need. Bounded by the skills list. */
export async function schoolFamilies(repo: Repo, schoolId: string): Promise<FamilyRow[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const ids = [...idx.ids];
  const skills: Row[] = [];
  for (let i = 0; i < ids.length; i += 400) skills.push(...(await repo.findMany("Skill", { id: { in: ids.slice(i, i + 400) } }, { select: ["id", "code", "name", "familyId", "isActive"] })));
  const real = skills.filter((k) => !isHiddenSkill(k.code) && on(k.isActive));
  const famIds = [...new Set(real.map((k) => s(k.familyId)))];
  if (!famIds.length) return [];
  const [fams, mapAreas, links] = await Promise.all([
    repo.findMany("SkillFamily", { id: { in: famIds } }, { select: ["id", "code", "name", "domain", "category", "mapGoalAreaId"] }),
    repo.findMany("MapGoalArea", {}, { select: ["id", "code"] }),
    repo.findMany("NafsSkillLink", { familyId: { in: famIds } }, { select: ["familyId", "areaId", "source"] }),
  ]);
  const stdLinks: Row[] = [];
  const realIds = real.map((k) => s(k.id));
  for (let i = 0; i < realIds.length; i += 400) stdLinks.push(...(await repo.findMany("SkillStandard", { skillId: { in: realIds.slice(i, i + 400) } }, { select: ["skillId", "standardId", "isPrimary"] })));
  const stds = stdLinks.length ? await repo.findMany("Standard", { id: { in: [...new Set(stdLinks.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : [];
  const codeOf = new Map(stds.map((x) => [s(x.id), s(x.code)]));
  return fams.map((f) => {
    const ks = real.filter((k) => s(k.familyId) === s(f.id));
    const kIds = new Set(ks.map((k) => s(k.id)));
    const link = links.find((l) => s(l.familyId) === s(f.id));
    return {
      familyId: s(f.id), code: s(f.code), family: s(f.name), skillIds: [...kIds], skills: [...new Set(ks.map((k) => s(k.name)))].slice(0, 4),
      grades: [...new Set(ks.map((k) => idx.gradeOf.get(s(k.id)) ?? 0).filter(Boolean))].sort((a, b) => a - b),
      mapArea: s(mapAreas.find((a) => a.id === f.mapGoalAreaId)?.code) || null,
      standards: [...new Set(stdLinks.filter((l) => kIds.has(s(l.skillId))).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => codeOf.get(s(l.standardId)) ?? "").filter(Boolean))],
      domain: s(f.domain), category: s(f.category), nafsAreaId: link ? s(link.areaId) : null, nafsSource: link ? s(link.source) : null,
    };
  }).sort((a, b) => a.family.localeCompare(b.family));
}

export interface NafsSeedResult { linked: { family: string; area: string; reason: string }[]; review: { family: string; guess: string | null; confidence: number; reason: string }[]; alreadyLinked: number }

/** Links every family without a NAFS area whose rule is confident; the others go to “needs review”. Idempotent. */
export async function seedNafsLinks(repo: Repo, schoolId: string, opts: { apply: boolean; actorId?: string | null; now?: Date } = { apply: false }): Promise<NafsSeedResult> {
  const now = opts.now ?? new Date();
  if (opts.apply) await ensureNafsAreas(repo);
  const areas = await nafsAreas(repo);
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const out: NafsSeedResult = { linked: [], review: [], alreadyLinked: 0 };
  for (const f of await schoolFamilies(repo, schoolId)) {
    if (f.nafsAreaId) { out.alreadyLinked++; continue; }
    const d = nafsRuleForFamily({ code: f.code, name: f.family, domain: f.domain, category: f.category, mapArea: f.mapArea, standards: f.standards });
    const area = d.area ? byCode.get(d.area) ?? NAFS_DEFAULT_AREAS.find((a) => a.code === d.area) : undefined;
    if (d.area && d.confidence >= LINK_CONFIDENCE && (!opts.apply || (area && "id" in area))) {
      out.linked.push({ family: f.family, area: area?.name ?? d.area, reason: d.reason });
      if (opts.apply && area && "id" in area) {
        await repo.upsert("NafsSkillLink", { familyId: f.familyId }, { familyId: f.familyId, areaId: area.id, source: "AUTO", updatedAt: now }, { areaId: area.id, source: "AUTO", updatedAt: now });
        await audit(repo, { actorId: opts.actorId ?? null, action: "nafs.link.auto", entityType: "SkillFamily", entityId: f.familyId, after: { area: d.area, reason: d.reason, confidence: d.confidence }, at: now });
      }
    } else {
      out.review.push({ family: f.family, guess: area?.name ?? null, confidence: d.confidence, reason: d.reason });
      if (opts.apply) await fileReview(repo, { schoolId, kind: "FAMILY_NAFS", subjectId: f.familyId, excerpt: `${f.family} (Grades ${f.grades.join(", ")})`, guessId: d.area, guessLabel: area?.name ?? null, confidence: d.confidence, reason: d.reason }, now);
    }
  }
  return out;
}

/** One “needs review” row (never reopens one an admin already approved or dismissed). */
export async function fileReview(repo: Repo, r: { schoolId: string; kind: string; subjectId: string; excerpt: string; guessId: string | null; guessLabel: string | null; confidence: number; reason: string }, now = new Date()): Promise<void> {
  const key = { schoolId: r.schoolId, kind: r.kind, subjectId: r.subjectId };
  const prev = await repo.findUnique("SkillLinkReview", key);
  const data = { excerpt: r.excerpt.replace(/\s+/g, " ").slice(0, 200), guessId: r.guessId ? r.guessId.slice(0, 40) : null, guessLabel: r.guessLabel ? r.guessLabel.slice(0, 160) : null, confidence: Math.round(r.confidence * 100) / 100, reason: r.reason.slice(0, 255) };
  if (!prev) await repo.create("SkillLinkReview", { ...key, ...data, status: "OPEN", createdAt: now });
  else if (s(prev.status) === "OPEN") await repo.updateMany("SkillLinkReview", key, data);
}

/** A review row is settled (the admin linked it, or a later run linked it). */
export async function settleReview(repo: Repo, schoolId: string, kind: string, subjectId: string, status: "APPROVED" | "DISMISSED", by: string | null, now = new Date()): Promise<void> {
  await repo.updateMany("SkillLinkReview", { schoolId, kind, subjectId, status: "OPEN" }, { status, reviewedById: by, reviewedAt: now });
}

// ------------------------------------------------------------------ the admin page (/admin/nafs-links)

export interface NafsLinkRow { familyId: string; family: string; skills: string[]; grades: number[]; questions: number; standard: string | null; mapArea: string | null; areaCode: string | null; source: string | null; suggested: string | null; confidence: number; reason: string }

function assertAdmin(actor: Actor): void {
  assertCan(actor, "curriculum:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins link skills to NAFS areas.");
}

/** Every skill family of the school with its NAFS area (or none), the rule's suggestion and its question count. */
export async function nafsLinks(repo: Repo, actor: Actor): Promise<{ rows: NafsLinkRow[]; areas: NafsArea[] }> {
  assertAdmin(actor);
  const schoolId = s(actor.schoolId);
  const [fams, areas] = await Promise.all([schoolFamilies(repo, schoolId), nafsAreas(repo)]);
  const counts = await countQuestionsOfSkills(repo, schoolId, fams.flatMap((f) => f.skillIds), { own: true }); // added up per family: own counts (one bank)
  const rows = fams.map((f) => {
    const d = nafsRuleForFamily({ code: f.code, name: f.family, domain: f.domain, category: f.category, mapArea: f.mapArea, standards: f.standards });
    return {
      familyId: f.familyId, family: f.family, skills: f.skills, grades: f.grades, questions: f.skillIds.reduce((t, id) => t + (counts.get(id) ?? 0), 0),
      standard: f.standards[0]?.replace(/^CCSS\.ELA-LITERACY\./i, "") ?? null, mapArea: f.mapArea,
      areaCode: areas.find((a) => a.id === f.nafsAreaId)?.code ?? null, source: f.nafsSource, suggested: d.area, confidence: d.confidence, reason: d.reason,
    };
  });
  rows.sort((a, b) => Number(Boolean(a.areaCode)) - Number(Boolean(b.areaCode)) || b.questions - a.questions || a.family.localeCompare(b.family));
  return { rows, areas };
}

/** The admin sets (or clears) a family's NAFS area. ADMIN links are never changed automatically. */
export async function linkNafsFamily(repo: Repo, actor: Actor, familyId: string, areaCode: string | null, now = new Date()): Promise<void> {
  assertAdmin(actor);
  await assertCanEditSharedCatalogue(repo, actor); // families and NAFS areas are shared by every school
  const f = await repo.findUnique("SkillFamily", { id: familyId });
  if (!f) throw new ValidationError("Skill not found.");
  const area = areaCode ? (await repo.findMany("NafsArea", { code: areaCode }))[0] : null;
  if (areaCode && !area) throw new ValidationError("Unknown NAFS area.");
  const prev = await repo.findUnique("NafsSkillLink", { familyId });
  if (area) await repo.upsert("NafsSkillLink", { familyId }, { familyId, areaId: area.id, source: "ADMIN", updatedAt: now }, { areaId: area.id, source: "ADMIN", updatedAt: now });
  else await repo.deleteMany("NafsSkillLink", { familyId });
  await settleReview(repo, s(actor.schoolId), "FAMILY_NAFS", familyId, "APPROVED", actor.userId, now);
  await audit(repo, { actorId: actor.userId, action: "nafs.link", entityType: "SkillFamily", entityId: familyId, before: { areaId: prev?.areaId ?? null }, after: { area: areaCode }, at: now });
}

/** Applies every confident suggestion to the families without a NAFS area (the same rule as the script). */
export async function applyNafsSuggestions(repo: Repo, actor: Actor, now = new Date()): Promise<number> {
  assertAdmin(actor);
  await assertCanEditSharedCatalogue(repo, actor);
  return (await seedNafsLinks(repo, s(actor.schoolId), { apply: true, actorId: actor.userId, now })).linked.length;
}

/** Adds an area, or renames / reorders / switches one off (areas are never deleted: links keep pointing at them). */
export async function saveNafsArea(repo: Repo, actor: Actor, input: { id?: string; code?: string; name: string; sortOrder?: number; isActive?: boolean }, now = new Date()): Promise<string> {
  assertAdmin(actor);
  await assertCanEditSharedCatalogue(repo, actor);
  const name = s(input.name).replace(/\s+/g, " ").trim().slice(0, 120);
  if (name.length < 2) throw new ValidationError("Give the area a name.");
  if (input.id) {
    const prev = await repo.findUnique("NafsArea", { id: input.id });
    if (!prev) throw new ValidationError("Area not found.");
    await repo.updateMany("NafsArea", { id: input.id }, { name, ...(input.sortOrder !== undefined ? { sortOrder: Math.floor(input.sortOrder) } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) });
    await audit(repo, { actorId: actor.userId, action: "nafs.area.update", entityType: "NafsArea", entityId: input.id, before: { name: prev.name, isActive: prev.isActive }, after: { name, isActive: input.isActive }, at: now });
    return input.id;
  }
  const code = s(input.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
  if (!code) throw new ValidationError("Give the area a code.");
  if ((await repo.findMany("NafsArea", { code })).length) throw new ValidationError("An area with this code already exists.");
  const max = (await nafsAreas(repo)).reduce((m, a) => Math.max(m, a.sortOrder), 0);
  const row = await repo.create("NafsArea", { code, name, sortOrder: input.sortOrder ?? max + 1, isActive: true, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "nafs.area.create", entityType: "NafsArea", entityId: s(row.id), after: { code, name }, at: now });
  return s(row.id);
}

/** A question's own NAFS area (overrides its skill's); null removes the override. Admin only. */
export async function setQuestionNafsArea(repo: Repo, actor: Actor, questionId: string, areaCode: string | null, now = new Date()): Promise<void> {
  assertAdmin(actor);
  const q = await repo.findUnique("Question", { id: questionId });
  const idx = await schoolSkillIndex(repo, s(actor.schoolId));
  if (!q || !idx.ids.has(s(q.skillId))) throw new ForbiddenError("Question not found.");
  const area = areaCode ? (await repo.findMany("NafsArea", { code: areaCode }))[0] : null;
  if (areaCode && !area) throw new ValidationError("Unknown NAFS area.");
  if (area) await repo.upsert("NafsQuestionArea", { questionId }, { questionId, areaId: area.id, setById: actor.userId, setAt: now }, { areaId: area.id, setById: actor.userId, setAt: now });
  else await repo.deleteMany("NafsQuestionArea", { questionId });
  await audit(repo, { actorId: actor.userId, action: "nafs.question_area", entityType: "Question", entityId: questionId, after: { area: areaCode }, at: now });
}
