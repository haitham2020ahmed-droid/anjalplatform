/**
 * 🧩 ONE master skills list — the single source every skill list on the platform reads from:
 * every active skill of the school's grades (Skills, Grammar, Concept Vocabulary, Curriculum Map skills,
 * MAP skills), with its grade, kind, MAP goal area, standards and published question count. A skill added
 * later (import, editor, Grammar bank) appears everywhere automatically.
 *
 * Possible duplicates (same grade, same meaning, different names) are FOUND here, never merged silently:
 * an admin reviews each pair and presses Merge. A merge moves every question, assignment and curriculum
 * link to the kept skill and switches the other one off (it is not deleted); it is recorded and can be undone.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { countQuestionsOfSkills } from "../questions/skill-questions";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";

const s = (v: unknown) => String(v ?? "");
export type SkillKind = "GRAMMAR" | "VOCABULARY" | "READING" | "LANGUAGE" | "OTHER";
export const KIND_NAME: Record<SkillKind, string> = { GRAMMAR: "Grammar", VOCABULARY: "Vocabulary", READING: "Reading", LANGUAGE: "Language", OTHER: "Other" };

export interface MasterSkill { id: string; code: string; name: string; grade: number; kind: SkillKind; area: string | null; standards: string[]; questions: number; inUnit: boolean }

/** Never shown in lists: the holding skill for map questions without a real skill. */
export const isHiddenSkill = (code: unknown) => s(code).endsWith(".curriculum-map-unclassified");

function kindOf(code: string, domain: string, areaSubject: string | null): SkillKind {
  if (code.toLowerCase().includes(".grammar.")) return "GRAMMAR";
  if (/VOCAB/i.test(domain)) return "VOCABULARY";
  if (areaSubject === "LANGUAGE_USAGE" || /LANGUAGE|WRITING|GRAMMAR|MECHANICS/i.test(domain)) return "LANGUAGE";
  if (/READING|LITERATURE|INFORMATIONAL/i.test(domain) || areaSubject === "READING") return "READING";
  return "OTHER";
}

const listCache = new WeakMap<object, Map<string, { v: string; at: number; p: Promise<MasterSkill[]> }>>();
/** what the list is built from: a write to any of these (in this process) builds it again */
const LIST_MODELS = ["Grade", "Curriculum", "Skill", "SkillFamily", "SkillStandard", "Standard", "UnitSkill", "MapGoalArea", "Question", "QuestionMapLink"];

/**
 * The master list (optionally one grade). Fixed number of queries whatever the size. ⚡ Every skill picker, the
 * curriculum pages and the question analysis read it: kept per school until one of its tables changes (and at most
 * a minute, like the skill index); callers get their own copy.
 */
export function masterSkills(repo: Repo, schoolId: string, opts: { grade?: number; withQuestionsOnly?: boolean } = {}): Promise<MasterSkill[]> {
  let m = listCache.get(repo); if (!m) listCache.set(repo, (m = new Map()));
  const key = `${schoolId}|${opts.grade ?? ""}|${opts.withQuestionsOnly ? 1 : 0}`, v = modelVersion(...LIST_MODELS), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < 60_000) return hit.p.then((x) => structuredClone(x));
  const p = masterSkillsNow(repo, schoolId, opts);
  remember(m, key, { v, at: Date.now(), p }, 16);
  p.catch(() => m!.delete(key));
  return p.then((x) => structuredClone(x));
}

async function masterSkillsNow(repo: Repo, schoolId: string, opts: { grade?: number; withQuestionsOnly?: boolean }): Promise<MasterSkill[]> {
  const grades = (await repo.findMany("Grade", { schoolId }, { select: ["id", "level", "isActive"] })).filter((g) => g.isActive !== false && (!opts.grade || Number(g.level) === opts.grade));
  if (!grades.length) return [];
  const curs = await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id", "gradeId"] });
  if (!curs.length) return [];
  const skills = (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "code", "name", "domain", "familyId", "curriculumId", "isActive", "sequence"] }))
    .filter((k) => k.isActive !== false && !isHiddenSkill(k.code));
  if (!skills.length) return [];
  const ids = skills.map((k) => k.id);
  // UI reorg Phase 1: the published count comes from the ONE shared function (search = MAP = NAFS = this list)
  const [fams, links, count, units] = await Promise.all([
    repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] }),
    repo.findMany("SkillStandard", { skillId: { in: ids } }),
    countQuestionsOfSkills(repo, schoolId, ids.map(s)),
    repo.findMany("UnitSkill", { skillId: { in: ids } }, { select: ["skillId"] }),
  ]);
  const [areas, stds] = await Promise.all([
    repo.findMany("MapGoalArea", { id: { in: [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))] } }, { select: ["id", "name", "subject"] }),
    links.length ? repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => s(l.standardId)))] } }, { select: ["id", "code"] }) : Promise.resolve([] as Row[]),
  ]);
  const inUnit = new Set(units.map((u) => s(u.skillId)));
  // ⚡ lookups by id (were a scan of every family / area / link / standard for each skill)
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level ?? 0)]));
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), levelOf.get(s(c.gradeId)) ?? 0]));
  const famArea = new Map<string, unknown>();
  for (const f of fams) if (!famArea.has(s(f.id))) famArea.set(s(f.id), f.mapGoalAreaId);
  const areaById = new Map<string, Row>();
  for (const a of areas) if (!areaById.has(s(a.id))) areaById.set(s(a.id), a);
  const codeOf = new Map<string, unknown>();
  for (const x of stds) if (!codeOf.has(s(x.id))) codeOf.set(s(x.id), x.code);
  const linksOf = new Map<string, Row[]>();
  for (const l of links) { const k = s(l.skillId); const list = linksOf.get(k); if (list) list.push(l); else linksOf.set(k, [l]); }
  const out = skills.map((k) => {
    const areaId = famArea.get(s(k.familyId));
    const area = areaId === undefined || areaId === null ? undefined : areaById.get(s(areaId));
    return {
      id: s(k.id), code: s(k.code), name: s(k.name), grade: gradeOfCur.get(s(k.curriculumId)) ?? 0, kind: kindOf(s(k.code), s(k.domain), area ? s(area.subject) : null), area: area ? s(area.name) : null,
      standards: (linksOf.get(s(k.id)) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((l) => s(codeOf.get(s(l.standardId))).replace(/^CCSS\.ELA-LITERACY\./, "")).filter(Boolean),
      questions: count.get(s(k.id)) ?? 0, inUnit: inUnit.has(s(k.id)),
    };
  });
  return out.filter((k) => !opts.withQuestionsOnly || k.questions > 0).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ duplicates

const STOP = new Set(["a", "an", "the", "and", "of", "to", "in", "for", "with", "using", "use", "identify", "identifying", "understand", "understanding", "skill", "skills", "text", "texts", "s"]);
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "");
/** A skill name's meaning key: lower case, no punctuation or filler words, simple stems, sorted. */
export function meaningKey(name: string): string {
  return [...new Set(name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem))].sort().join(" ");
}

export interface DuplicateGroup { grade: number; key: string; skills: MasterSkill[]; keep: string }

/** Same grade + same meaning key = possible duplicates. The one with the most questions is suggested to keep. */
export async function duplicateSkills(repo: Repo, actor: Actor): Promise<DuplicateGroup[]> {
  assertCan(actor, "curriculum:edit");
  const all = await masterSkills(repo, actor.schoolId!);
  const groups = new Map<string, MasterSkill[]>();
  for (const k of all) { const key = `${k.grade}|${k.kind === "GRAMMAR" ? "G:" : ""}${meaningKey(k.name)}`; if (!meaningKey(k.name)) continue; groups.set(key, [...(groups.get(key) ?? []), k]); }
  return [...groups.entries()].filter(([, v]) => v.length > 1).map(([key, v]) => {
    const sorted = [...v].sort((a, b) => b.questions - a.questions || Number(b.inUnit) - Number(a.inUnit) || a.name.localeCompare(b.name));
    return { grade: v[0].grade, key: key.split("|")[1], skills: sorted, keep: sorted[0].id };
  }).sort((a, b) => a.grade - b.grade || a.key.localeCompare(b.key));
}

/** Where skills are listed on the platform (for the audit page): each list now reads masterSkills. */
export const SKILL_LISTS = [
  "Teacher → Curriculum (by unit, by MAP goal area, “More skills”)",
  "Teacher → Assignments → New (skill dropdown)",
  "Teacher → Games (skills for a live game)",
  "Teacher → Grammar (Grammar skills by week/lesson)",
  "Question Bank (filter and editor skill pickers)",
  "ReadMaster (article skill)",
  "MAP recommendations / plans (skills by goal area)",
  "Admin → Skills (master list)",
] as const;

// ------------------------------------------------------------------ merge (admin, explicit, reversible)

export interface MergeResult { questions: number; assignments: number; links: number }

export async function mergeSkills(repo: Repo, actor: Actor, keepId: string, mergeId: string, now = new Date()): Promise<MergeResult> {
  assertCan(actor, "curriculum:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins merge skills.");
  if (keepId === mergeId) throw new ValidationError("Choose two different skills.");
  const list = await masterSkills(repo, actor.schoolId!);
  const keep = list.find((k) => k.id === keepId), gone = list.find((k) => k.id === mergeId);
  if (!keep || !gone) throw new ValidationError("Both skills must be active skills of this school.");
  if (keep.grade !== gone.grade) throw new ValidationError("Only skills of the same grade can be merged.");
  const qs = await repo.findMany("Question", { skillId: mergeId }, { select: ["id", "externalRef"] });
  const keepRefs = new Set((await repo.findMany("Question", { skillId: keepId }, { select: ["externalRef"] })).map((q) => s(q.externalRef)).filter(Boolean));
  const movedQuestions: { id: string; externalRef: string | null }[] = [];
  const result: MergeResult = { questions: 0, assignments: 0, links: 0 };
  const added: { table: string; key: Record<string, unknown> }[] = [];
  const movedAssignments: { id: string; skillId: string | null; skillIds: unknown }[] = [];
  await repo.transaction(async (tx) => {
    for (const q of qs) {
      // @@unique([skillId, externalRef]): a clashing import reference is cleared (the question is kept)
      const ref = q.externalRef ? s(q.externalRef) : null;
      await tx.updateMany("Question", { id: q.id }, { skillId: keepId, ...(ref && keepRefs.has(ref) ? { externalRef: null } : {}) });
      movedQuestions.push({ id: s(q.id), externalRef: ref });
      result.questions++;
    }
    const as = (await tx.findMany("Assignment", { skillId: mergeId }, { select: ["id", "skillId", "skillIds"] }));
    for (const a of as) {
      const list2 = Array.isArray(a.skillIds) ? (a.skillIds as unknown[]).map(String) : [];
      await tx.updateMany("Assignment", { id: a.id }, { skillId: keepId, skillIds: [...new Set(list2.map((x) => (x === mergeId ? keepId : x)))] });
      movedAssignments.push({ id: s(a.id), skillId: s(a.skillId), skillIds: a.skillIds ?? null }); result.assignments++;
    }
    for (const table of ["UnitSkill", "SkillStandard"] as const) {
      const rows = await tx.findMany(table, { skillId: mergeId });
      for (const r of rows) {
        const key = table === "UnitSkill" ? { unitId: r.unitId, skillId: keepId } : { skillId: keepId, standardId: r.standardId };
        if ((await tx.findMany(table, key)).length) continue;
        await tx.create(table, table === "UnitSkill" ? { unitId: r.unitId, skillId: keepId, order: r.order ?? 0 } : { skillId: keepId, standardId: r.standardId, isPrimary: false });
        added.push({ table, key }); result.links++;
      }
    }
    for (const r of await tx.findMany("LessonSkill", { skillId: mergeId })) {
      const key = { lessonId: r.lessonId, skillId: keepId, label: r.label };
      if ((await tx.findMany("LessonSkill", key)).length) continue;
      await tx.create("LessonSkill", { ...key, subskillId: r.subskillId ?? null, role: r.role });
      added.push({ table: "LessonSkill", key }); result.links++;
    }
    await tx.updateMany("Skill", { id: mergeId }, { isActive: false });
    await audit(tx, { actorId: actor.userId, action: "skill.merge", entityType: "Skill", entityId: mergeId, before: { name: gone.name }, after: { into: keepId, intoName: keep.name, questions: movedQuestions, assignments: movedAssignments, added }, at: now });
  });
  return result;
}

/** Undo the last merge of this skill: its questions, assignments and links go back, and it is switched on again. */
export async function undoMerge(repo: Repo, actor: Actor, mergedId: string, now = new Date()): Promise<number> {
  assertCan(actor, "curriculum:edit");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins merge skills.");
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
  const log = (await repo.findMany("AuditLog", { entityType: "Skill", entityId: mergedId, action: "skill.merge" })).sort((a, b) => t(b.createdAt) - t(a.createdAt))[0];
  if (!log) throw new ValidationError("This skill was not merged.");
  const skill = await repo.findUnique("Skill", { id: mergedId });
  const cur = skill ? await repo.findUnique("Curriculum", { id: skill.curriculumId }) : null;
  const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
  if (!grade || s(grade.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Skill not found.");
  const a = (log.after ?? {}) as { questions?: { id: string; externalRef: string | null }[]; assignments?: { id: string; skillId: string; skillIds: unknown }[]; added?: { table: string; key: Record<string, unknown> }[] };
  let n = 0;
  await repo.transaction(async (tx) => {
    for (const q of a.questions ?? []) { n += await tx.updateMany("Question", { id: q.id }, { skillId: mergedId, externalRef: q.externalRef }); }
    for (const x of a.assignments ?? []) await tx.updateMany("Assignment", { id: x.id }, { skillId: x.skillId, skillIds: x.skillIds });
    for (const x of a.added ?? []) await tx.deleteMany(x.table, x.key);
    await tx.updateMany("Skill", { id: mergedId }, { isActive: true });
    await audit(tx, { actorId: actor.userId, action: "skill.merge.undo", entityType: "Skill", entityId: mergedId, at: now });
  });
  return n;
}
